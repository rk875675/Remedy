import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { checkRateLimitFixedWindow } from '../_shared/ratelimit.ts';
import { requestSchema, resolvedPlanSchema } from '../_shared/assignment/schema.ts';
import { buildPlan, type Answers } from '../_shared/assignment/engine.ts';
import { getRebuildEligibility, nextRebuildStamp } from '../_shared/rebuildCooldown.ts';
import { loadAssignmentContext } from '../_shared/assignment/loadContext.ts';
import { isPendingApplyDue } from '../_shared/assignment/programAnswers.ts';

// assign-program
// Materializes a frozen per-user plan snapshot from onboarding answers + the active
// assignment rules + the active master template. Runs server-side (service role) so it
// can write the RLS-protected snapshot tables.
//
// Input (zod strict — see ../_shared/assignment/schema.ts):
//   { user_id?, start_week?, preview_only?, answers?, apply_pending? }
//   - preview_only=true: compute + return the plan WITHOUT writing (match screen).
//   - answers provided: used directly (preview before onboarding row is saved).
//   - apply_pending=true: week-boundary flush of saved answers; skips rebuild cooldown.
//   - otherwise: onboarding_answers row for user_id is loaded.

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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

    // Server-authoritative identity: derive the acting user from the VERIFIED JWT, never a
    // client-supplied user_id. An anon / publishable-key caller has no user, so getUser
    // returns none and any path that touches a specific account is refused below. (Previously
    // this used a decode-only helper that accepted a null-sub anon token and let body.user_id
    // stand in for identity — a full auth bypass.)
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    const authedUserId = user?.id ?? null;

    // Rate limit: 20 assignments / 60s per verified user (preview calls included).
    if (authedUserId) {
      const redisUrl = Deno.env.get('UPSTASH_REDIS_REST_URL');
      const redisToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');
      if (redisUrl && redisToken) {
        const rl = await checkRateLimitFixedWindow(
          `ratelimit:assign-program:${authedUserId}`,
          20,
          60,
        );
        if (!rl.allowed) {
          return json({ error: 'rate_limited', retryAfter: rl.retryAfter }, 429);
        }
      }
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = requestSchema.safeParse(raw);
    if (!parsed.success) {
      return json({ error: 'invalid_request', details: parsed.error.flatten() }, 400);
    }
    const body = parsed.data;

    // preview_only WITH inline answers is a pure, no-persistence computation (the
    // pre-signup match screen) and stays open to anonymous callers. Every other path —
    // persisting a plan, or loading a user's stored onboarding answers — acts on a specific
    // account and requires a verified user. body.user_id is intentionally ignored.
    const needsIdentity = !body.preview_only || !body.answers;
    if (needsIdentity && !authedUserId) return json({ error: 'unauthorized' }, 401);
    // Guaranteed non-null on every path that reads/writes a user's data (see needsIdentity).
    const userId = authedUserId as string;

    // --- Entitlement gate -----------------------------------------------------
    // Persisting a full personalized program is a paid feature. preview_only=true (the
    // pre-purchase match screen) stays open; the persistence path requires an active
    // entitlement or a dev profile, so a free-tier user can't invoke this directly to
    // generate + store a program without converting.
    let isDev = false;
    if (!body.preview_only) {
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
      isDev = prof?.is_dev === true;

      if (!entitled && !isDev) {
        return json({ error: 'not_entitled' }, 403);
      }
    }

    // --- Load answers ---------------------------------------------------------
    let answers: Answers;
    if (body.answers) {
      answers = body.answers;
    } else {
      const { data: oa, error } = await supabase
        .from('onboarding_answers')
        .select(
          'pain_location, pain_duration, pain_type, activity_level, pain_trigger, equipment, main_goal, sessions_per_week_preference',
        )
        .eq('user_id', userId)
        .single();
      if (error || !oa) return json({ error: 'no_onboarding_answers' }, 404);
      if (!oa.equipment) return json({ error: 'missing_equipment' }, 400);
      answers = oa as Answers;
    }

    let startWeek = body.start_week ?? 1;
    let preservePointer = false;
    if (body.apply_pending && !body.preview_only) {
      const { data: pendingRow } = await supabase
        .from('user_programs')
        .select('current_week, pending_apply_week, active_plan_id')
        .eq('user_id', userId)
        .maybeSingle();
      const { data: pendingPlan } = pendingRow?.active_plan_id
        ? await supabase
            .from('user_program_plans')
            .select('duration_weeks')
            .eq('id', pendingRow.active_plan_id)
            .maybeSingle()
        : { data: null };
      const durationWeeks = pendingPlan?.duration_weeks ?? 5;
      const currentWeek = pendingRow?.current_week ?? 1;
      if (currentWeek > durationWeeks) {
        await supabase
          .from('user_programs')
          .update({
            applied_answers: answers,
            pending_apply_week: null,
          })
          .eq('user_id', userId);
        return json({ skipped: true });
      }
      if (!isPendingApplyDue(pendingRow?.pending_apply_week ?? null, currentWeek)) {
        return json({ skipped: true });
      }
      startWeek = currentWeek;
      preservePointer = true;
    }

    const ctx = await loadAssignmentContext(supabase);
    if ('error' in ctx) return json({ error: ctx.error }, 500);
    const { rules, rulesVersion, templateId, template, exercises, replacements } = ctx;

    // --- Build the plan -------------------------------------------------------
    const built = buildPlan({
      answers,
      rules,
      rulesVersion,
      exercises,
      template,
      replacements,
      startWeek,
    });

    // Output guard: never persist/return a malformed plan.
    const planParse = resolvedPlanSchema.safeParse(built);
    if (!planParse.success) {
      return json({ error: 'plan_validation_failed', details: planParse.error.flatten() }, 500);
    }
    const plan = planParse.data;

    // Preview only: do not persist. Enrich exercises with display data.
    const exerciseById = new Map(exercises.map((e) => [e.id, e]));
    const enrich = (week: number) =>
      plan.sessions
        .filter((s) => s.week_number === week)
        .map((s) => ({
          ...s,
          exercises: s.exercises.map((pe) => ({
            ...pe,
            name: exerciseById.get(pe.exercise_id)?.name ?? 'Exercise',
          })),
        }));

    // Rebuild cooldown: only when replacing an existing active plan. First-time
    // assignment is never blocked. Dev accounts skip so local testing is not locked.
    let rebuildMeta: {
      last_program_rebuild_at: string | null;
      last_program_rebuild_grace_used: boolean;
    } | null = null;
    if (!body.preview_only) {
      const { data: upRow } = await supabase
        .from('user_programs')
        .select('active_plan_id, last_program_rebuild_at, last_program_rebuild_grace_used')
        .eq('user_id', userId)
        .maybeSingle();
      const isRebuild = !!upRow?.active_plan_id && !body.apply_pending;
      if (isRebuild) {
        if (!isDev) {
          const eligibility = getRebuildEligibility(
            upRow.last_program_rebuild_at ?? null,
            upRow.last_program_rebuild_grace_used === true,
          );
          if (!eligibility.allowed) {
            return json(
              {
                error: 'rebuild_cooldown',
                next_eligible_at: eligibility.nextEligibleAt?.toISOString() ?? null,
              },
              429,
            );
          }
        }
        rebuildMeta = {
          last_program_rebuild_at: upRow.last_program_rebuild_at ?? null,
          last_program_rebuild_grace_used: upRow.last_program_rebuild_grace_used === true,
        };
      }
    }

    if (body.preview_only) {
      return json({
        preview: true,
        program_name: plan.program_name,
        subtitle: plan.subtitle,
        tagline: plan.tagline,
        duration_weeks: plan.duration_weeks,
        sessions_per_week: plan.sessions_per_week,
        primary_focus: plan.primary_focus,
        secondary_focus: plan.secondary_focus,
        week_one: enrich(plan.start_week),
        equipment_tier: answers.equipment,
        pain_trigger: answers.pain_trigger,
      });
    }

    // --- Persist snapshot -----------------------------------------------------
    // The RPC holds a transaction-scoped per-user advisory lock, supersedes the old
    // snapshot, inserts every child row, and updates the user_programs pointer in one
    // transaction. A failure at any point restores the previous active plan + pointer.
    const { data: persistedPlanId, error: persistError } = await supabase.rpc(
      'assign_user_program_snapshot',
      {
        p_user_id: userId,
        p_template_id: templateId,
        p_plan: plan,
        p_preserve_pointer: preservePointer,
      },
    );
    if (persistError || typeof persistedPlanId !== 'string') {
      return json({ error: 'snapshot_persist_failed' }, 500);
    }
    const planId = persistedPlanId;

    const appliedUpdate: Record<string, unknown> = {
      applied_answers: answers,
      pending_apply_week: null,
    };
    if (rebuildMeta) {
      const stamp = nextRebuildStamp(
        rebuildMeta.last_program_rebuild_at,
        rebuildMeta.last_program_rebuild_grace_used,
      );
      Object.assign(appliedUpdate, stamp);
    }
    await supabase.from('user_programs').update(appliedUpdate).eq('user_id', userId);

    return json({
      plan_id: planId,
      program_name: plan.program_name,
      subtitle: plan.subtitle,
      tagline: plan.tagline,
      duration_weeks: plan.duration_weeks,
      sessions_per_week: plan.sessions_per_week,
      equipment_tier: answers.equipment,
      week_one: enrich(plan.start_week),
    });
  } catch {
    return json({ error: 'internal_error' }, 500);
  }
});
