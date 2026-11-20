// User-facing strings derived from a clinical profile. Client only.
// Copy is the table in spec 01 section 3. No diagnoses, no outcome promises.

import {
  HARD_NOW,
  deriveProfile,
  normalizeIntake,
  nsScoreOf,
  programWeeks,
  type ClinicalProfile,
  type Intake,
  type LegacyAnswers,
} from './intake';

export type ProfileSummary = {
  patternTitle: string;
  patternBody: string;
  startTitle: string;
  startBody: string;
  nsTitle: string;
  nsBody: string;
  focusChips: string[];
  adaptations: string[];
  goals: string[];
};

const PATTERN: Record<ClinicalProfile['bias'], { title: string; body: string }> = {
  flexion_sensitive: {
    title: 'Bending-sensitive back',
    body: 'Sitting and bending stir it up. The plan starts by opening the other way.',
  },
  extension_sensitive: {
    title: 'Arching-sensitive back',
    body: 'Standing and arching stir it up. The plan starts with rounding, and skips deep back-bends.',
  },
  neutral: {
    title: 'Mixed pattern',
    body: 'No single direction sets it off. The plan moves a little each way, then builds.',
  },
};

const START: Record<ClinicalProfile['mode'], { title: string; body: string }> = {
  calm: {
    title: 'Gentle start',
    body: 'The first two weeks stay short and calm. More only when check-ins say so.',
  },
  control: {
    title: 'Steady start',
    body: 'Pain is present but stable. Control first, then strength.',
  },
  build: {
    title: 'Ready to build',
    body: 'Movement is tolerated well, so strength can start sooner.',
  },
};

const NS_COPY: Record<ClinicalProfile['sensitization'], { title: string; body: string }> = {
  high: {
    title: 'Nervous system: turned up',
    body: 'Your answers suggest it has become protective. Sessions stay calm and repeatable.',
  },
  some: {
    title: 'Nervous system: partly involved',
    body: 'Stress and anticipation play a part. Short calm-down drills sit with the movement.',
  },
  low: {
    title: 'Nervous system: quiet',
    body: 'It behaves more like a movement pattern, so that is what the plan trains.',
  },
};

/** Nervous-system lines shared by the result screen and the plan summary. */
export function nsCopy(level: ClinicalProfile['sensitization']): { title: string; body: string } {
  return NS_COPY[level];
}

const EMPHASIS_ORDER = ['mobility', 'control', 'strength', 'relaxation'] as const;

const EMPHASIS_LABEL: Record<(typeof EMPHASIS_ORDER)[number], string> = {
  mobility: 'Mobility',
  control: 'Core control',
  strength: 'Strength',
  relaxation: 'Calm-down drills',
};

const GOAL_LABEL: Record<(typeof HARD_NOW)[number], string> = {
  bed: 'Getting out of bed without bracing',
  bending: 'Bending and lifting without that pause',
  stairs: 'Stairs without thinking about it',
  walking: 'Walking further',
  sitting: 'Sitting through the day',
  standing: 'Standing for longer',
  twisting: 'Twisting and turning freely',
  overhead: 'Reaching overhead',
  sleep: 'Sleeping through the night',
  exercise: 'Getting back to training',
};

const LONG_DURATION = new Set<Intake['duration_detail']>(['3_12m', '1_5y', '5y_plus']);

const LOCATION_LABEL: Record<LegacyAnswers['pain_location'], string> = {
  upper: 'Upper back',
  lower: 'Lower back',
  all: 'Whole back',
};

const DURATION_DETAIL_LABEL: Record<Intake['duration_detail'], string> = {
  lt_2w: 'Less than 2 weeks',
  '2w_3m': '2 weeks to 3 months',
  '3_12m': '3 to 12 months',
  '1_5y': '1 to 5 years',
  '5y_plus': 'More than 5 years',
};

const EQUIPMENT_LABEL: Record<LegacyAnswers['equipment'], string> = {
  open_space: 'Bodyweight',
  bands_dumbbells: 'Bands and dumbbells',
  gym: 'Full gym',
};

function weeksLine(template: string, weeks: number): string {
  return template.replace('{weeks}', String(weeks));
}

function focusChips(profile: ClinicalProfile): string[] {
  const ranked = [...EMPHASIS_ORDER].sort((a, b) => {
    const delta = profile.emphasis[b] - profile.emphasis[a];
    if (delta !== 0) return delta;
    return EMPHASIS_ORDER.indexOf(a) - EMPHASIS_ORDER.indexOf(b);
  });
  const chips: string[] = [];
  const first = ranked[0];
  const second = ranked[1];
  if (first) chips.push(EMPHASIS_LABEL[first]);
  if (second) chips.push(EMPHASIS_LABEL[second]);
  if (profile.exposureBending) chips.push('Hip hinge practice');
  if (profile.unilateralFocus) chips.push('One-side balance');
  if (profile.radicular !== 'none') chips.push('Nerve-friendly moves');
  return chips.slice(0, 5);
}

function adaptations(intake: Intake, profile: ClinicalProfile): string[] {
  const weeks = profile.earlyWeeks;
  const lines: string[] = [];
  if (profile.radicular === 'below_knee') {
    lines.push(
      'No hamstring or nerve-stretching moves, because pain that travels below the knee does better without them.',
    );
  }
  if (profile.bias === 'flexion_sensitive') {
    lines.push(weeksLine('No deep forward bends or loaded rounding for the first {weeks} weeks.', weeks));
  }
  if (profile.bias === 'extension_sensitive') {
    lines.push(
      intake.conditions.includes('stenosis')
        ? 'No deep back-bends in this program.'
        : weeksLine('No deep back-bends for the first {weeks} weeks.', weeks),
    );
  }
  if (profile.flags.osteoporosis) {
    lines.push('No loaded bending or twisting, to protect your spine.');
  }
  if (profile.flags.pregnant) {
    lines.push(
      'Bodyweight only, nothing face-down, and nothing that strains your abdomen. Check with your midwife or doctor before starting.',
    );
  }
  if (profile.flags.postpartum) {
    lines.push(weeksLine('Deep core first, and no heavy abdominal pressure for the first {weeks} weeks.', weeks));
  }
  if (profile.flags.postSurgery) {
    lines.push("Bodyweight only and no loaded bending or twisting. Follow your surgeon's guidance first.");
  }
  if (profile.flags.fibromyalgia) {
    lines.push('Shorter sessions with longer rests, because slow and steady works best with fibromyalgia.');
  }
  if (
    profile.gentleStart &&
    !profile.flags.pregnant &&
    !profile.flags.postSurgery &&
    !profile.flags.fibromyalgia
  ) {
    lines.push('Weeks 1 and 2 use lighter doses so your back can settle.');
  }
  if (profile.flags.olderAdult) {
    lines.push('Balance-heavy moves wait until week 3.');
  }
  if (profile.fear === 'high') {
    lines.push('We bring back the moves you avoid in small, planned steps.');
  }
  return lines.slice(0, 5);
}

export function profileSummary(
  _answers: LegacyAnswers,
  intake: Intake,
  profile: ClinicalProfile,
): ProfileSummary {
  const pattern = PATTERN[profile.bias];
  const start = START[profile.mode];
  const ns = NS_COPY[profile.sensitization];
  return {
    patternTitle: pattern.title,
    patternBody: pattern.body,
    startTitle: start.title,
    startBody: start.body,
    nsTitle: ns.title,
    nsBody: ns.body,
    focusChips: focusChips(profile),
    adaptations: adaptations(intake, profile),
    goals: intake.hard_now.map((item) => GOAL_LABEL[item]),
  };
}

function nsReady(ns: Partial<Intake['ns']> | undefined): ns is Intake['ns'] {
  return (
    ns?.predictable !== undefined &&
    ns.small_triggers !== undefined &&
    ns.stress !== undefined &&
    ns.anticipation !== undefined &&
    ns.avoidance !== undefined
  );
}

/** Sensitization band from whatever of ns, spread, duration, and conditions is filled in. */
export function nsLevelPreview(intake: Partial<Intake>): 'low' | 'some' | 'high' {
  const fibro = intake.conditions?.includes('fibromyalgia') ?? false;
  if (!nsReady(intake.ns)) return fibro ? 'high' : 'low';
  const score = nsScoreOf(intake.ns, intake.spread ?? '');
  const long = intake.duration_detail !== undefined && LONG_DURATION.has(intake.duration_detail);
  if ((score >= 6 && long) || fibro) return 'high';
  if (score >= 3) return 'some';
  return 'low';
}

export function formatDose(dose: {
  sets: number | null;
  reps: number | null;
  duration_seconds: number | null;
  per_side?: boolean | null;
}): string {
  if (dose.sets == null) return '';
  const side = dose.per_side ? ' each side' : '';
  if (dose.duration_seconds != null && dose.reps != null) {
    return `${dose.sets} x ${dose.reps} x ${dose.duration_seconds}s holds${side}`;
  }
  if (dose.duration_seconds != null) return `${dose.sets} x ${dose.duration_seconds}s${side}`;
  if (dose.reps != null) return `${dose.sets} x ${dose.reps}${side}`;
  return `${dose.sets}`;
}

export function locationLabel(location: LegacyAnswers['pain_location']): string {
  return LOCATION_LABEL[location];
}

export function durationDetailLabel(detail: Intake['duration_detail']): string {
  return DURATION_DETAIL_LABEL[detail];
}

export function equipmentLabel(equipment: LegacyAnswers['equipment']): string {
  return EQUIPMENT_LABEL[equipment];
}

export function minutesLabel(minutes: Intake['minutes']): string {
  return `${minutes} min`;
}

/** Same length the server engine builds. */
export function programWeeksFor(answers: LegacyAnswers, intake: Intake): number {
  return programWeeks(answers, intake, deriveProfile(answers, intake));
}

/** Length before the careful check is answered. Red flags do not change it. */
export function programWeeksBeforeSafety(
  answers: LegacyAnswers,
  intakePartial: Record<string, unknown>,
  minutes: Intake['minutes'],
): number | null {
  const intake = completeIntake(answers, {
    red_flags: [],
    red_flag_ack: false,
    ...intakePartial,
    minutes,
  });
  return intake ? programWeeksFor(answers, intake) : null;
}

export function programEndDateLabel(weeks: number, now: Date = new Date()): string {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  end.setDate(end.getDate() + weeks * 7);
  return end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function completeIntake(
  answers: { pain_type?: unknown },
  intakePartial: unknown,
): Intake | null {
  if (intakePartial === null || typeof intakePartial !== 'object' || Array.isArray(intakePartial)) {
    return null;
  }
  const painType = Array.isArray(answers.pain_type)
    ? answers.pain_type.filter((item): item is string => typeof item === 'string')
    : [];
  return normalizeIntake({ v: 1, ...intakePartial }, painType);
}
