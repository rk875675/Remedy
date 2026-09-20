import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  type AssignmentRulesConfig,
  type CatalogExercise,
  type ReplacementEntry,
  type TemplateInput,
  type TemplateSession,
} from './engine.ts';

export type AssignmentContext = {
  rules: AssignmentRulesConfig;
  rulesVersion: number;
  templateId: string;
  template: TemplateInput;
  exercises: CatalogExercise[];
  replacements: ReplacementEntry[];
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
  };
}
