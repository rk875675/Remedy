import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { checkRateLimitFixedWindow } from '../_shared/ratelimit.ts';
import { answersSchema, applyProgramAnswersRequestSchema } from '../_shared/assignment/schema.ts';
import { buildPlan, type Answers, type CatalogExercise } from '../_shared/assignment/engine.ts';
import { loadAssignmentContext } from '../_shared/assignment/loadContext.ts';
import {
  classifyAnswerDiff,
  pendingApplyDecision,
  pickEquipmentSwap,
  sessionSlotsToAdd,
  sessionsToDrop,
  shouldAdvanceAfterSpwDecrease,
  type AnswerSnapshot,
} from '../_shared/assignment/programAnswers.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function asSnapshot(row: Answers): AnswerSnapshot | null {
  const parsed = answersSchema.safeParse(row);
  if (!parsed.success || !parsed.data.equipment) return null;
  return parsed.data as AnswerSnapshot;
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

    const redisUrl = Deno.env.get('UPSTASH_REDIS_REST_URL');
    const redisToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');
    if (redisUrl && redisToken) {
      const rl = await checkRateLimitFixedWindow(
        `ratelimit:apply-program-answers:${userId}`,
        20,
        60,
      );
      if (!rl.allowed) {
        return json({ error: 'rate_limited', retryAfter: rl.retryAfter }, 429);
      }
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = applyProgramAnswersRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return json({ error: 'invalid_request', details: parsed.error.flatten() }, 400);
    }
    const nextAnswers = parsed.data.answers as AnswerSnapshot;
    if (!nextAnswers.equipment) return json({ error: 'missing_equipment' }, 400);

    const [{ data: existingAnswers }, { data: upRow }] = await Promise.all([
      supabase
        .from('onboarding_answers')
        .select(
          'pain_location, pain_duration, pain_type, activity_level, pain_trigger, equipment, main_goal, sessions_per_week_preference',
        )
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('user_programs')
        .select('active_plan_id, current_week, current_session, applied_answers, pending_apply_week')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    const { error: saveError } = await supabase
      .from('onboarding_answers')
      .update({
        pain_location: nextAnswers.pain_location,
        pain_duration: nextAnswers.pain_duration,
        pain_type: nextAnswers.pain_type,
        activity_level: nextAnswers.activity_level,
        pain_trigger: nextAnswers.pain_trigger,
        equipment: nextAnswers.equipment,
        main_goal: nextAnswers.main_goal,
        sessions_per_week_preference: nextAnswers.sessions_per_week_preference,
      })
      .eq('user_id', userId);
    if (saveError) return json({ error: 'save_failed' }, 500);

    const planId = upRow?.active_plan_id ?? null;
    if (!planId || !upRow) {
      return json({
        saved: true,
        patched: [],
        pending_apply_week: null,
        apply_now: false,
        action: 'saved_only',
      });
    }

    const appliedParsed = upRow.applied_answers
      ? answersSchema.safeParse(upRow.applied_answers)
      : existingAnswers
        ? answersSchema.safeParse(existingAnswers)
        : null;
    const applied = appliedParsed && appliedParsed.success ? asSnapshot(appliedParsed.data as Answers) : null;
    const baseline = applied ?? asSnapshot((existingAnswers ?? nextAnswers) as Answers);
    if (!baseline) return json({ error: 'invalid_applied_answers' }, 500);

    const diff = classifyAnswerDiff(baseline, nextAnswers);
    const { data: planMeta } = await supabase
      .from('user_program_plans')
      .select('id, duration_weeks, sessions_per_week, status')
      .eq('id', planId)
      .eq('status', 'active')
      .maybeSingle();

    if (diff.unchanged) {
      await supabase
        .from('user_programs')
        .update({ pending_apply_week: null })
        .eq('user_id', userId);
      return json({
        saved: true,
        patched: [],
        pending_apply_week: null,
        apply_now: false,
        action: 'noop',
      });
    }

    const currentWeek = upRow.current_week;
    const currentSession = upRow.current_session;
    const durationWeeks = planMeta?.duration_weeks ?? 5;
    const decision = pendingApplyDecision(currentWeek, durationWeeks, diff.expensive.length > 0);
    const patched: Array<'equipment' | 'sessions_per_week_preference'> = [];

    const ctx = diff.cheap.length > 0 ? await loadAssignmentContext(supabase) : null;
    if (ctx && 'error' in ctx) return json({ error: ctx.error }, 500);

    if (diff.cheap.includes('equipment') && ctx && !('error' in ctx)) {
      const swapped = await patchEquipment({
        supabase,
        planId,
        currentWeek,
        currentSession,
        userTier: nextAnswers.equipment,
        ctx,
      });
      if (!swapped.ok) return json({ error: swapped.error }, 500);
      patched.push('equipment');
    }

    if (diff.cheap.includes('sessions_per_week_preference') && ctx && !('error' in ctx)) {
      const newSpw =
        nextAnswers.sessions_per_week_preference ?? planMeta?.sessions_per_week ?? 3;
      const oldSpw = planMeta?.sessions_per_week ?? newSpw;
      const spw = await patchSessionsPerWeek({
        supabase,
        userId,
        planId,
        currentWeek,
        currentSession,
        durationWeeks,
        oldSpw,
        newSpw,
        answers: {
          ...nextAnswers,
          pain_location: baseline.pain_location,
          pain_duration: baseline.pain_duration,
          pain_type: baseline.pain_type,
          activity_level: baseline.activity_level,
          pain_trigger: baseline.pain_trigger,
          main_goal: baseline.main_goal,
        },
        ctx,
      });
      if (!spw.ok) return json({ error: spw.error }, 500);
      patched.push('sessions_per_week_preference');
    }

    const nextApplied: AnswerSnapshot = {
      ...baseline,
      ...(patched.includes('equipment') ? { equipment: nextAnswers.equipment } : {}),
      ...(patched.includes('sessions_per_week_preference')
        ? { sessions_per_week_preference: nextAnswers.sessions_per_week_preference }
        : {}),
    };

    await supabase
      .from('user_programs')
      .update({
        applied_answers: nextApplied,
        pending_apply_week: decision.pending_apply_week,
      })
      .eq('user_id', userId);

    const action = decision.apply_now
      ? 'apply_now'
      : decision.pending_apply_week
        ? 'scheduled'
        : patched.length > 0
          ? 'patched'
          : 'saved_only';

    return json({
      saved: true,
      patched,
      pending_apply_week: decision.pending_apply_week,
      apply_now: decision.apply_now,
      action,
    });
  } catch {
    return json({ error: 'internal_error' }, 500);
  }
});

type Ctx = Exclude<Awaited<ReturnType<typeof loadAssignmentContext>>, { error: string }>;

async function patchEquipment(args: {
  supabase: ReturnType<typeof createClient>;
  planId: string;
  currentWeek: number;
  currentSession: number;
  userTier: AnswerSnapshot['equipment'];
  ctx: Ctx;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, planId, currentWeek, currentSession, userTier, ctx } = args;
  const ranks = ctx.rules.equipment.tier_rank;
  const userTierRank = ranks[userTier] ?? 0;

  const { data: sessions, error: sErr } = await supabase
    .from('user_plan_sessions')
    .select('id, week_number, session_number')
    .eq('plan_id', planId);
  if (sErr || !sessions) return { ok: false, error: 'patch_sessions_failed' };

  const remaining = sessions.filter(
    (s) =>
      s.week_number > currentWeek ||
      (s.week_number === currentWeek && s.session_number >= currentSession),
  );
  if (remaining.length === 0) return { ok: true };

  const { data: rows, error: eErr } = await supabase
    .from('user_plan_session_exercises')
    .select('id, plan_session_id, exercise_id, load_tier')
    .in(
      'plan_session_id',
      remaining.map((s) => s.id),
    );
  if (eErr || !rows) return { ok: false, error: 'patch_exercises_failed' };

  const catalog: CatalogExercise[] = ctx.exercises;
  const byId = new Map(catalog.map((ex) => [ex.id, ex]));
  const pool = catalog.map((ex) => ({
    id: ex.id,
    equipment_tier: ex.equipment_tier,
    movement_pattern: ex.movement_pattern,
  }));
  const replacements = ctx.replacements.map((r) => ({
    movement_pattern: r.movement_pattern,
    exercise_id: r.exercise_id,
    priority: r.priority,
  }));

  const bySession = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = bySession.get(row.plan_session_id) ?? [];
    list.push(row);
    bySession.set(row.plan_session_id, list);
  }

  for (const sessionRows of bySession.values()) {
    const usedIds = new Set(sessionRows.map((r) => r.exercise_id));
    for (const row of sessionRows) {
      const current = byId.get(row.exercise_id);
      if (!current) continue;
      usedIds.delete(row.exercise_id);
      const nextId = pickEquipmentSwap(
        {
          id: current.id,
          equipment_tier: current.equipment_tier,
          movement_pattern: current.movement_pattern,
        },
        pool,
        replacements,
        userTierRank,
        ranks,
        usedIds,
      );
      usedIds.add(nextId ?? current.id);
      if (!nextId || nextId === current.id) continue;
      const next = byId.get(nextId);
      if (!next) continue;
      const { error } = await supabase
        .from('user_plan_session_exercises')
        .update({
          exercise_id: next.id,
          sets: next.sets,
          reps: next.reps,
          duration_seconds: next.duration_seconds,
          rest_seconds: next.rest_seconds,
        })
        .eq('id', row.id);
      if (error) return { ok: false, error: 'equipment_swap_failed' };
    }
  }

  const subtitle = ctx.rules.equipment.subtitle_when[userTier];
  if (subtitle) {
    await supabase.from('user_program_plans').update({ subtitle }).eq('id', planId);
  }
  return { ok: true };
}

async function patchSessionsPerWeek(args: {
  supabase: ReturnType<typeof createClient>;
  userId: string;
  planId: string;
  currentWeek: number;
  currentSession: number;
  durationWeeks: number;
  oldSpw: number;
  newSpw: number;
  answers: AnswerSnapshot;
  ctx: Ctx;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const {
    supabase,
    userId,
    planId,
    currentWeek,
    currentSession,
    durationWeeks,
    oldSpw,
    newSpw,
    answers,
    ctx,
  } = args;
  if (newSpw === oldSpw) return { ok: true };

  const { data: sessions, error: sErr } = await supabase
    .from('user_plan_sessions')
    .select('id, week_number, session_number')
    .eq('plan_id', planId);
  if (sErr || !sessions) return { ok: false, error: 'patch_sessions_failed' };

  if (newSpw < oldSpw) {
    const drop = sessionsToDrop(sessions, currentWeek, currentSession, newSpw);
    if (drop.length > 0) {
      const dropIds = sessions
        .filter((s) => drop.some((d) => d.week_number === s.week_number && d.session_number === s.session_number))
        .map((s) => s.id);
      if (dropIds.length > 0) {
        const { data: completed } = await supabase
          .from('session_completions')
          .select('plan_session_id')
          .in('plan_session_id', dropIds);
        const completedIds = new Set((completed ?? []).map((c) => c.plan_session_id));
        const deletable = dropIds.filter((id) => !completedIds.has(id));
        if (deletable.length > 0) {
          const { error } = await supabase.from('user_plan_sessions').delete().in('id', deletable);
          if (error) return { ok: false, error: 'spw_delete_failed' };
        }
      }
    }

    if (shouldAdvanceAfterSpwDecrease(currentSession, newSpw)) {
      const nextWeek = currentWeek + 1;
      if (nextWeek > durationWeeks) {
        await supabase
          .from('user_programs')
          .update({ current_week: durationWeeks + 1, current_session: 1 })
          .eq('user_id', userId);
      } else {
        await supabase
          .from('user_programs')
          .update({ current_week: nextWeek, current_session: 1 })
          .eq('user_id', userId);
      }
    }
  } else {
    const built = buildPlan({
      answers: answers as Answers,
      rules: ctx.rules,
      rulesVersion: ctx.rulesVersion,
      exercises: ctx.exercises,
      template: ctx.template,
      replacements: ctx.replacements,
      startWeek: currentWeek,
    });
    const weeks = Array.from({ length: durationWeeks - currentWeek + 1 }, (_, i) => currentWeek + i);
    const slots = sessionSlotsToAdd(weeks, oldSpw, newSpw, currentWeek, currentSession);
    for (const slot of slots) {
      const session = built.sessions.find(
        (s) => s.week_number === slot.week_number && s.session_number === slot.session_number,
      );
      if (!session) continue;
      const { data: inserted, error: insErr } = await supabase
        .from('user_plan_sessions')
        .insert({
          plan_id: planId,
          week_number: session.week_number,
          session_number: session.session_number,
          title: session.title,
          phase: session.phase,
          estimated_minutes: session.estimated_minutes,
          intensity_tier: session.intensity_tier,
        })
        .select('id')
        .single();
      if (insErr || !inserted) return { ok: false, error: 'spw_insert_failed' };
      if (session.exercises.length > 0) {
        const { error: exErr } = await supabase.from('user_plan_session_exercises').insert(
          session.exercises.map((ex) => ({
            plan_session_id: inserted.id,
            exercise_id: ex.exercise_id,
            order_index: ex.order_index,
            sets: ex.sets,
            reps: ex.reps,
            duration_seconds: ex.duration_seconds,
            rest_seconds: ex.rest_seconds,
            load_tier: ex.load_tier,
          })),
        );
        if (exErr) return { ok: false, error: 'spw_insert_exercises_failed' };
      }
    }
  }

  const { error: headerErr } = await supabase
    .from('user_program_plans')
    .update({ sessions_per_week: newSpw })
    .eq('id', planId);
  if (headerErr) return { ok: false, error: 'spw_header_failed' };
  return { ok: true };
}
