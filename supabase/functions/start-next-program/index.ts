import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { checkRateLimitFixedWindow } from '../_shared/ratelimit.ts';
import {
  answersSchema,
  NEXT_PROGRAM_FEEDBACK_MAX,
  resolvedPlanSchema,
  startNextProgramRequestSchema,
  startNextProgramRpcResultSchema,
} from '../_shared/assignment/schema.ts';
import { buildPlan, clampProgressionLevel, type Answers, type EquipmentTier } from '../_shared/assignment/engine.ts';
import { buildPlanWithFallback } from '../_shared/assignment/engineV2.ts';
import { loadAssignmentContext, loadUserIntake } from '../_shared/assignment/loadContext.ts';
import {
  answersForNextProgram,
  nextProgressionLevel,
  type NextProgramRequest,
  type ProgramCheckin,
  type SavedAnswers,
} from '../_shared/assignment/nextProgram.ts';

// start-next-program
// Program complete → the user's next program (replaces "Restart Program").
//
// Input (zod strict — ../_shared/assignment/schema.ts):
//   { choice: 'continue', expected_plan_id, idempotency_key }
//   { choice: 'rebuild',  expected_plan_id, idempotency_key, checkin }
//
// The plan is built here with the shared engine. The completeness re-check, new
// snapshot, saved answers, level, program count and check-in row then commit together
// in start_next_program (migration 087). Retrying with the same idempotency_key after a
// lost response returns the plan the first attempt created.

const FEEDBACK_TO = 'social@remedyrecoveries.com';
const FEEDBACK_FROM = 'Remedy <hello@send.remedyrecoveries.com>';
const EMAIL_TIMEOUT_MS = 4000;

const RPC_CONFLICTS = [
  'plan_changed',
  'program_not_complete',
  'no_active_program',
  'no_onboarding_answers',
] as const;

const PAIN_CHANGE_LABEL: Record<ProgramCheckin['pain_change'], string> = {
  much_better: 'Much better',
  better: 'A little better',
  same: 'About the same',
  worse: 'Worse',
};

const DIFFICULTY_LABEL: Record<ProgramCheckin['difficulty'], string> = {
  too_easy: 'Too easy',
  just_right: 'Just right',
  too_hard: 'Too hard',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function sanitizeFeedback(raw: string | undefined): string | null {
  if (!raw) return null;
  const clean = raw
    .replace(/\0/g, '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, NEXT_PROGRAM_FEEDBACK_MAX)
    .trim();
  return clean.length > 0 ? clean : null;
}

type Outcome = {
  plan_id: string | null;
  from_level: number;
  to_level: number;
  replayed: boolean;
};

async function respond(
  supabase: SupabaseClient,
  userId: string,
  outcome: Outcome,
  equipment: EquipmentTier,
): Promise<Response> {
  if (!outcome.plan_id) return json({ error: 'plan_changed' }, 409);
  const [{ data: plan }, { data: up }] = await Promise.all([
    supabase
      .from('user_program_plans')
      .select('id, program_name, subtitle, duration_weeks, sessions_per_week, status')
      .eq('id', outcome.plan_id)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('user_programs')
      .select('active_plan_id, programs_completed')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);
  // A replayed key whose program has since been replaced is no longer the answer.
  if (!plan || plan.status !== 'active' || up?.active_plan_id !== plan.id) {
    return json({ error: 'plan_changed' }, 409);
  }
  return json({
    plan_id: plan.id,
    program_name: plan.program_name,
    subtitle: plan.subtitle,
    duration_weeks: plan.duration_weeks,
    sessions_per_week: plan.sessions_per_week,
    equipment_tier: equipment,
    from_level: outcome.from_level,
    progression_level: outcome.to_level,
    program_number: (up?.programs_completed ?? 0) + 1,
    replayed: outcome.replayed,
  });
}

async function emailFeedback(args: {
  userId: string;
  userEmail: string | null;
  checkin: ProgramCheckin;
  fromLevel: number;
  toLevel: number;
  programName: string;
  feedback: string;
}): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    console.error('[start-next-program] RESEND_API_KEY missing — feedback stored without email');
    return;
  }
  const text = [
    'Program check-in',
    `Pain vs start: ${PAIN_CHANGE_LABEL[args.checkin.pain_change]}`,
    `Workouts felt: ${DIFFICULTY_LABEL[args.checkin.difficulty]}`,
    `Level: ${args.fromLevel} → ${args.toLevel}`,
    `Next program: ${args.programName}`,
    `User: ${args.userId}`,
    `Email: ${args.userEmail ?? 'unknown'}`,
    '',
    args.feedback,
  ].join('\n');
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FEEDBACK_FROM,
        to: [FEEDBACK_TO],
        reply_to: args.userEmail ?? undefined,
        subject: '[Program check-in] Remedy',
        text,
      }),
      signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
    });
    if (!res.ok) console.error(`[start-next-program] email failed: resend_http_${res.status}`);
  } catch (err) {
    console.error(
      '[start-next-program] email failed:',
      err instanceof Error ? err.message : 'unknown',
    );
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'missing_auth' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    if (!user) return json({ error: 'unauthorized' }, 401);
    const userId = user.id;

    const rl = await checkRateLimitFixedWindow(`ratelimit:start-next-program:${userId}`, 10, 60);
    if (!rl.allowed) return json({ error: 'rate_limited', retryAfter: rl.retryAfter }, 429);

    const raw = await req.json().catch(() => ({}));
    const parsed = startNextProgramRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return json({ error: 'invalid_request', details: parsed.error.flatten() }, 400);
    }
    const body = parsed.data;

    // Same gate as assign-program: persisting a program is a paid feature.
    const [{ data: ent }, { data: prof }] = await Promise.all([
      supabase
        .from('entitlements')
        .select('is_premium, subscription_status, expires_at')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase.from('profiles').select('is_dev').eq('id', userId).maybeSingle(),
    ]);
    const notExpired = !ent?.expires_at || new Date(ent.expires_at).getTime() > Date.now();
    const entitled =
      !!ent &&
      ent.is_premium === true &&
      notExpired &&
      ['active', 'trial', 'dev_trial', 'cancelled'].includes(ent.subscription_status);
    if (!entitled && prof?.is_dev !== true) return json({ error: 'not_entitled' }, 403);

    const { data: prior } = await supabase
      .from('program_checkins')
      .select('to_plan_id, from_level, to_level, answers')
      .eq('user_id', userId)
      .eq('idempotency_key', body.idempotency_key)
      .maybeSingle();
    if (prior) {
      const priorAnswers = answersSchema.safeParse(prior.answers);
      if (!priorAnswers.success) return json({ error: 'internal_error' }, 500);
      return await respond(
        supabase,
        userId,
        {
          plan_id: prior.to_plan_id,
          from_level: prior.from_level,
          to_level: prior.to_level,
          replayed: true,
        },
        priorAnswers.data.equipment,
      );
    }

    const { data: up } = await supabase
      .from('user_programs')
      .select('active_plan_id, current_week, progression_level')
      .eq('user_id', userId)
      .maybeSingle();
    if (!up?.active_plan_id) return json({ error: 'no_active_program' }, 409);
    if (up.active_plan_id !== body.expected_plan_id) return json({ error: 'plan_changed' }, 409);

    const { data: finished } = await supabase
      .from('user_program_plans')
      .select('duration_weeks, sessions_per_week')
      .eq('id', up.active_plan_id)
      .eq('status', 'active')
      .maybeSingle();
    if (!finished) return json({ error: 'no_active_program' }, 409);
    if (up.current_week <= finished.duration_weeks) {
      return json({ error: 'program_not_complete' }, 409);
    }

    const { data: saved } = await supabase
      .from('onboarding_answers')
      .select(
        'pain_location, pain_duration, pain_type, activity_level, pain_trigger, equipment, main_goal, sessions_per_week_preference',
      )
      .eq('user_id', userId)
      .maybeSingle();
    if (!saved) return json({ error: 'no_onboarding_answers' }, 404);

    const request: NextProgramRequest =
      body.choice === 'continue'
        ? { choice: 'continue' }
        : { choice: 'rebuild', checkin: body.checkin };
    const merged = answersSchema.safeParse(
      answersForNextProgram(saved as SavedAnswers, finished.sessions_per_week, request),
    );
    if (!merged.success) return json({ error: 'incomplete_answers' }, 400);
    const answers = merged.data as Answers;

    const fromLevel = clampProgressionLevel(up.progression_level);
    const toLevel = nextProgressionLevel(fromLevel, request);

    const ctx = await loadAssignmentContext(supabase);
    if ('error' in ctx) return json({ error: ctx.error }, 500);

    const intake = await loadUserIntake(supabase, userId);
    const planParse = resolvedPlanSchema.safeParse(
      buildPlanWithFallback({
        intake,
        details: ctx.details,
        input: {
          answers,
          exercises: ctx.exercises,
          startWeek: 1,
          progressionLevel: toLevel,
        },
        buildV1: () =>
          buildPlan({
            answers,
            rules: ctx.rules,
            rulesVersion: ctx.rulesVersion,
            exercises: ctx.exercises,
            template: ctx.template,
            replacements: ctx.replacements,
            startWeek: 1,
            progressionLevel: toLevel,
          }),
      }).plan,
    );
    if (!planParse.success) {
      return json({ error: 'plan_validation_failed', details: planParse.error.flatten() }, 500);
    }

    const feedback = body.choice === 'rebuild' ? sanitizeFeedback(body.checkin.feedback) : null;

    const { data: rpcData, error: rpcError } = await supabase.rpc('start_next_program', {
      p_user_id: userId,
      p_expected_plan_id: body.expected_plan_id,
      p_idempotency_key: body.idempotency_key,
      p_choice: body.choice,
      p_template_id: ctx.templateId,
      p_plan: planParse.data,
      p_answers: answers,
      p_to_level: toLevel,
      p_pain_change: body.choice === 'rebuild' ? body.checkin.pain_change : null,
      p_difficulty: body.choice === 'rebuild' ? body.checkin.difficulty : null,
      p_feedback: feedback,
    });
    if (rpcError) {
      const conflict = RPC_CONFLICTS.find((code) => rpcError.message.includes(code));
      if (conflict) return json({ error: conflict }, conflict === 'no_onboarding_answers' ? 404 : 409);
      console.error('[start-next-program] start_next_program failed:', rpcError.message);
      return json({ error: 'persist_failed' }, 500);
    }
    const outcome = startNextProgramRpcResultSchema.safeParse(rpcData);
    if (!outcome.success) return json({ error: 'persist_failed' }, 500);

    if (!outcome.data.replayed && feedback && body.choice === 'rebuild') {
      await emailFeedback({
        userId,
        userEmail: user.email ?? null,
        checkin: body.checkin,
        fromLevel: outcome.data.from_level,
        toLevel: outcome.data.to_level,
        programName: planParse.data.program_name,
        feedback,
      });
    }

    return await respond(supabase, userId, outcome.data, answers.equipment);
  } catch (err) {
    console.error(
      '[start-next-program] internal_error:',
      err instanceof Error ? err.message : 'unknown',
    );
    return json({ error: 'internal_error' }, 500);
  }
});
