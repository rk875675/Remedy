import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  type AssignmentRulesConfig,
  type CatalogExercise,
  type ReplacementEntry,
  type TemplateInput,
  type TemplateSession,
} from './engine.ts';
import { intakeSchema, type Intake } from './intake.ts';
import { isDoseClass, type ExerciseDetail, type SpineBias } from './engineV2.ts';

export type AssignmentContext = {
  rules: AssignmentRulesConfig;
  rulesVersion: number;
  templateId: string;
  template: TemplateInput;
  exercises: CatalogExercise[];
  replacements: ReplacementEntry[];
  details: ExerciseDetail[];
};

export async function loadAssignmentContext(
  supabase: SupabaseClient,
): Promise<AssignmentContext | { error: string }> {
  const [rulesRes, exercisesRes, templateRes, replacementsRes] = await Promise.all([
    supabase.from('assignment_rules').select('version, rules').eq('is_active', true).single(),
    supabase.from('exercises').select('*').eq('is_assignable', true),
    supabase
      .from('program_templates')
      .select('id, week_phase_plan')
      .eq('is_active', true)
      .limit(1)
      .single(),
    supabase.from('exercise_replacement_groups').select('movement_pattern, exercise_id, priority'),
  ]);

  if (rulesRes.error || !rulesRes.data) return { error: 'no_active_rules' };
  if (templateRes.error || !templateRes.data) return { error: 'no_active_template' };
  if (exercisesRes.error || !exercisesRes.data) return { error: 'no_exercises' };

  const templateId = templateRes.data.id as string;
  const { data: tSessions, error: tsErr } = await supabase
    .from('program_template_sessions')
    .select('id, session_index, title_template, phase')
    .eq('template_id', templateId)
    .order('session_index', { ascending: true });
  if (tsErr || !tSessions) return { error: 'no_template_sessions' };

  const { data: tSlots, error: slotErr } = await supabase
    .from('program_template_slots')
    .select('template_session_id, slot_order, selection_criteria')
    .in(
      'template_session_id',
      tSessions.map((s) => s.id),
    );
  if (slotErr) return { error: 'no_template_slots' };

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

  return {
    rules: rulesRes.data.rules as AssignmentRulesConfig,
    rulesVersion: rulesRes.data.version as number,
    templateId,
    template: {
      week_phase_plan: templateRes.data.week_phase_plan as Record<string, Record<string, number>>,
      sessions: templateSessions,
    },
    exercises: exercisesRes.data as unknown as CatalogExercise[],
    replacements: (replacementsRes.data ?? []) as ReplacementEntry[],
    details: await loadExerciseDetails(supabase),
  };
}

const SPINE_BIASES = new Set<string>(['flexion', 'extension', 'neutral', 'rotation', 'lateral']);

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function parseExerciseDetail(row: unknown): ExerciseDetail | null {
  if (row === null || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  if (typeof record.exercise_id !== 'string' || typeof record.slug !== 'string') return null;
  if (typeof record.dose_class !== 'string' || !isDoseClass(record.dose_class)) return null;
  if (typeof record.spine_bias !== 'string' || !SPINE_BIASES.has(record.spine_bias)) return null;
  if (typeof record.per_side !== 'boolean') return null;
  const spine = record.spine_bias as SpineBias;
  return {
    exercise_id: record.exercise_id,
    slug: record.slug,
    dose_class: record.dose_class,
    spine_bias: spine,
    contra: asStringArray(record.contra),
    function_targets: asStringArray(record.function_targets),
    per_side: record.per_side,
  };
}

async function loadExerciseDetails(supabase: SupabaseClient): Promise<ExerciseDetail[]> {
  try {
    const { data, error } = await supabase
      .from('exercise_details')
      .select('exercise_id, slug, dose_class, spine_bias, contra, function_targets, per_side');
    if (error || !data) {
      console.error('exercise_details_load_failed', error?.message ?? 'no_data');
      return [];
    }
    const details: ExerciseDetail[] = [];
    for (const row of data) {
      const parsed = parseExerciseDetail(row);
      if (parsed) details.push(parsed);
    }
    return details;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('exercise_details_load_failed', message);
    return [];
  }
}

export async function loadUserIntake(admin: SupabaseClient, userId: string): Promise<Intake | null> {
  try {
    const { data, error } = await admin
      .from('user_intake')
      .select('answers')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return null;
    const parsed = intakeSchema.safeParse(data.answers);
    return parsed.success ? parsed.data : null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('load_user_intake_failed', message);
    return null;
  }
}
