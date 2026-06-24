// Personalization bubble copy — shown when a user taps an option that affects their
// program plan. Keyed by `${field}:${value}`.
//
// Mirrors the "bubble" copy in assignment_rules v1 (migration 014). Keep the two in
// sync; the app shows these to set expectations, while the rules drive the actual plan.

export const personalizationBubbles: Record<string, string> = {
  // pain_duration (required)
  'pain_duration:acute': 'We will start gentler and shorter, building up as you progress.',
  'pain_duration:subacute': 'We will balance relief now with steady strengthening as you improve.',
  'pain_duration:chronic': 'We will include more strengthening earlier to build lasting relief.',

  // pain_type
  'pain_type:stiffness': 'Your plan leans into mobility work to loosen things up.',
  'pain_type:ache': 'A balanced mix of mobility and gentle strengthening.',
  'pain_type:sharp': 'Early sessions avoid aggravating movements; loading increases gradually.',
  'pain_type:multiple': 'We will keep early sessions to the safest movements, then progress carefully.',

  // pain_location
  'pain_location:all': 'We will rotate focus across your whole back through the week.',

  // main_goal
  'main_goal:reduce_pain': 'We will keep intensity conservative and prioritize relief.',
  'main_goal:return_to_exercise': 'We will progress toward heavier loading once your pain allows.',
  'main_goal:sleep': 'We will add gentle recovery and stretching emphasis.',
  'main_goal:mobility': 'We will prioritize range-of-motion work and ease into strength.',

  // equipment
  'equipment:open_space': 'Your plan uses bodyweight exercises only — no weights required.',
  'equipment:bands_dumbbells': 'Your plan uses bands and light dumbbells where helpful.',
  'equipment:gym': 'Your plan can use full gym equipment as you progress.',

  // sessions_per_week_preference (required)
  'sessions_per_week_preference:2': 'Lighter schedule — we will keep sessions efficient on your workout days.',
  'sessions_per_week_preference:3': 'A balanced, sustainable rhythm for steady progress.',
  'sessions_per_week_preference:4': 'A consistent cadence to build strength and mobility faster.',
  'sessions_per_week_preference:5': 'An ambitious schedule — we will manage fatigue across the week.',
};

export function getBubbleCopy(field: string, value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return personalizationBubbles[`${field}:${value}`] ?? null;
}
