import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { checkRateLimit, extractUserIdFromJwt } from '../_shared/ratelimit.ts';
import { requestSchema, resolvedPlanSchema } from '../_shared/assignment/schema.ts';
import {
  buildPlan,
  type AssignmentRulesConfig,
  type Answers,
  type CatalogExercise,
  type ReplacementEntry,
  type TemplateInput,
  type TemplateSession,
} from '../_shared/assignment/engine.ts';

// assign-program
// Materializes a frozen per-user plan snapshot from onboarding answers + the active
// assignment rules + the active master template. Runs server-side (service role) so it
// can write the RLS-protected snapshot tables.
//
// Input (zod strict — see ../_shared/assignment/schema.ts):
//   { user_id?, start_week?, preview_only?, answers? }
//   - preview_only=true: compute + return the plan WITHOUT writing (match screen).
//   - answers provided: used directly (preview before onboarding row is saved).
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

    const jwtUserId = extractUserIdFromJwt(authHeader);

    // Rate limit: 20 assignments / 60s per user (preview calls included).
    if (jwtUserId) {
      const redisUrl = Deno.env.get('UPSTASH_REDIS_REST_URL');
      const redisToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');
      if (redisUrl && redisToken) {
        const rl = await checkRateLimit(
          redisUrl,
          redisToken,
          `ratelimit:assign-program:${jwtUserId}`,
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

    // Resolve the acting user. A user may only assign for themselves.
    const userId = body.user_id ?? jwtUserId;
    if (!userId) return json({ error: 'missing_user' }, 400);
    if (jwtUserId && jwtUserId !== userId) return json({ error: 'forbidden' }, 403);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

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

    // --- Load rules / catalog / template -------------------------------------
    const [rulesRes, exercisesRes, templateRes, replacementsRes] = await Promise.all([
      supabase.from('assignment_rules').select('version, rules').eq('is_active', true).single(),
      supabase.from('exercises').select('*'),
      supabase
        .from('program_templates')
        .select('id, week_phase_plan')
        .eq('is_active', true)
        .limit(1)
        .single(),
      supabase.from('exercise_replacement_groups').select('movement_pattern, exercise_id, priority'),
    ]);

    if (rulesRes.error || !rulesRes.data) return json({ error: 'no_active_rules' }, 500);
    if (templateRes.error || !templateRes.data) return json({ error: 'no_active_template' }, 500);
    if (exercisesRes.error || !exercisesRes.data) return json({ error: 'no_exercises' }, 500);

    const rules = rulesRes.data.rules as AssignmentRulesConfig;
    const rulesVersion = rulesRes.data.version as number;
    const templateId = templateRes.data.id as string;

    // Load template sessions + their slots.
    const { data: tSessions, error: tsErr } = await supabase
      .from('program_template_sessions')
      .select('id, session_index, title_template, phase')
      .eq('template_id', templateId)
      .order('session_index', { ascending: true });
    if (tsErr || !tSessions) return json({ error: 'no_template_sessions' }, 500);

    const { data: tSlots, error: slotErr } = await supabase
      .from('program_template_slots')
      .select('template_session_id, slot_order, selection_criteria')
      .in(
        'template_session_id',
        tSessions.map((s) => s.id),
      );
    if (slotErr) return json({ error: 'no_template_slots' }, 500);

    const slotsBySession = new Map<string, { slot_order: number; selection_criteria: Record<string, unknown> }[]>();
    for (const slot of tSlots ?? []) {
      const list = slotsBySession.get(slot.template_session_id) ?? [];
      list.push({ slot_order: slot.slot_order, selection_criteria: slot.selection_criteria });
      slotsBySession.set(slot.template_session_id, list);
    }

    const templateSessions: TemplateSession[] = tSessions.map((s) => ({
      session_index: s.session_index,
      title_template: s.title_template,
      phase: s.phase,
      slots: (slotsBySession.get(s.id) ?? []).map((sl) => ({
        slot_order: sl.slot_order,
        selection_criteria: sl.selection_criteria,
      })),
    }));

    const template: TemplateInput = {
      week_phase_plan: templateRes.data.week_phase_plan as Record<string, Record<string, number>>,
      sessions: templateSessions,
    };

    const exercises = exercisesRes.data as unknown as CatalogExercise[];
    const replacements = (replacementsRes.data ?? []) as ReplacementEntry[];

    // --- Build the plan -------------------------------------------------------
    const built = buildPlan({
      answers,
      rules,
      rulesVersion,
      exercises,
      template,
      replacements,
      startWeek: body.start_week ?? 1,
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
    // Supersede any currently-active plan for this user.
    await supabase
      .from('user_program_plans')
      .update({ status: 'superseded', superseded_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('status', 'active');

    const { data: planRow, error: planErr } = await supabase
      .from('user_program_plans')
      .insert({
        user_id: userId,
        template_id: templateId,
        rules_version: plan.rules_version,
        program_name: plan.program_name,
        subtitle: plan.subtitle,
        tagline: plan.tagline,
        duration_weeks: plan.duration_weeks,
        sessions_per_week: plan.sessions_per_week,
        start_week: plan.start_week,
        status: 'active',
        primary_focus: plan.primary_focus,
        secondary_focus: plan.secondary_focus,
      })
      .select('id')
      .single();
    if (planErr || !planRow) return json({ error: 'plan_insert_failed' }, 500);
    const planId = planRow.id as string;

    const { data: sessionRows, error: sessErr } = await supabase
      .from('user_plan_sessions')
      .insert(
        plan.sessions.map((s) => ({
          plan_id: planId,
          week_number: s.week_number,
          session_number: s.session_number,
          title: s.title,
          phase: s.phase,
          estimated_minutes: s.estimated_minutes,
          intensity_tier: s.intensity_tier,
        })),
      )
      .select('id, week_number, session_number');
    if (sessErr || !sessionRows) return json({ error: 'sessions_insert_failed' }, 500);

    const sessionIdByKey = new Map<string, string>();
    for (const row of sessionRows) {
      sessionIdByKey.set(`${row.week_number}:${row.session_number}`, row.id);
    }

    const exerciseRows = plan.sessions.flatMap((s) => {
      const sid = sessionIdByKey.get(`${s.week_number}:${s.session_number}`);
      if (!sid) return [];
      return s.exercises.map((e) => ({
        plan_session_id: sid,
        exercise_id: e.exercise_id,
        order_index: e.order_index,
        sets: e.sets,
        reps: e.reps,
        duration_seconds: e.duration_seconds,
        rest_seconds: e.rest_seconds,
        load_tier: e.load_tier,
      }));
    });

    if (exerciseRows.length > 0) {
      const { error: exErr } = await supabase
        .from('user_plan_session_exercises')
        .insert(exerciseRows);
      if (exErr) return json({ error: 'exercises_insert_failed' }, 500);
    }

    // Point user_programs at the new plan (create if missing). On a retake the start
    // week is the next incomplete week.
    const { data: existingUp } = await supabase
      .from('user_programs')
      .select('id, program_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingUp) {
      await supabase
        .from('user_programs')
        .update({
          active_plan_id: planId,
          current_week: plan.start_week,
          current_session: 1,
          started_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
    } else {
      // program_id is legacy-required; point at any seeded program for FK satisfaction.
      const { data: anyProgram } = await supabase.from('programs').select('id').limit(1).single();
      await supabase.from('user_programs').insert({
        user_id: userId,
        program_id: anyProgram?.id,
        active_plan_id: planId,
        current_week: plan.start_week,
        current_session: 1,
      });
    }

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
