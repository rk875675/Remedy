import type { EquipmentTier, Exercise } from '../types/database';

/** User-facing equipment labels, ordered low → high for tier fallbacks. */
const TIER_FALLBACK: Record<EquipmentTier, string[]> = {
  open_space: [],
  bands_dumbbells: ['Resistance band or dumbbells'],
  gym: ['Gym equipment'],
};

/**
 * Per-exercise props from the catalog / shot list. Keys are exercise IDs.
 * Items are listed in the order they should appear when that exercise is first seen.
 */
const EXERCISE_EQUIPMENT: Record<string, readonly string[]> = {
  // Mobility — open space
  'cccc0001-0000-0000-0000-000000000001': ['Exercise mat'], // Cat-Cow
  'cccc0001-0000-0000-0000-000000000002': ['Sturdy chair'], // Thoracic Extension
  'cccc0001-0000-0000-0000-000000000003': ['Exercise mat'], // Open-Book
  'cccc0001-0000-0000-0000-000000000004': ['Exercise mat'], // Hip Flexor Stretch
  'cccc0001-0000-0000-0000-000000000005': ['Exercise mat'], // Knee-to-Chest
  'cccc0001-0000-0000-0000-000000000021': ['Exercise mat'], // Pelvic Tilt
  'cccc0001-0000-0000-0000-000000000022': ['Exercise mat'], // McKenzie Press-Up
  'cccc0001-0000-0000-0000-000000000023': ['Exercise mat'], // Supine Trunk Rotation
  'cccc0001-0000-0000-0000-000000000024': [], // Standing Back Extension
  // Activation
  'cccc0001-0000-0000-0000-000000000006': ['Exercise mat'], // Bird Dog
  'cccc0001-0000-0000-0000-000000000007': ['Exercise mat'], // Dead Bug
  'cccc0001-0000-0000-0000-000000000008': ['Exercise mat'], // Glute Bridge
  'cccc0001-0000-0000-0000-000000000009': ['Exercise mat'], // Side Plank (Knees)
  'cccc0001-0000-0000-0000-000000000031': ['Exercise mat'], // Side Plank (Full)
  'cccc0001-0000-0000-0000-000000000025': ['Exercise mat'], // Prone Hip Extension
  'cccc0001-0000-0000-0000-000000000026': ['Exercise mat'], // Single-Leg Glute Bridge

  'cccc0001-0000-0000-0000-000000000034': ['Dumbbell'], // Suitcase Carry
  // Strength — open space
  'cccc0001-0000-0000-0000-000000000011': [], // Bodyweight Hip Hinge
  'cccc0001-0000-0000-0000-000000000028': [], // Bodyweight Squat
  'cccc0001-0000-0000-0000-000000000029': [], // Single-Leg RDL
  'cccc0001-0000-0000-0000-000000000032': [], // Split Squat
  // Strength — bands / dumbbells
  'cccc0001-0000-0000-0000-000000000012': ['Resistance band'], // Banded RDL
  'cccc0001-0000-0000-0000-000000000033': ['Resistance band'], // Banded Row
  'cccc0001-0000-0000-0000-000000000013': ['Dumbbells'], // Dumbbell RDL
  'cccc0001-0000-0000-0000-000000000014': ['Dumbbell'], // Goblet Squat
  // Strength — gym
  'cccc0001-0000-0000-0000-000000000015': ['Barbell & bench'], // Barbell Hip Thrust
  'cccc0001-0000-0000-0000-000000000016': ['Cable machine'], // Seated Cable Row
  'cccc0001-0000-0000-0000-000000000017': ['Leg press machine'], // Leg Press
  'cccc0001-0000-0000-0000-000000000035': ['Kettlebell'], // Kettlebell Deadlift
  'cccc0001-0000-0000-0000-000000000036': ['Back extension bench'], // Back Extension (45°)
  // Recovery
  'cccc0001-0000-0000-0000-000000000018': ['Exercise mat'], // Child's Pose
  'cccc0001-0000-0000-0000-000000000019': ['Exercise mat'], // Figure-4
  'cccc0001-0000-0000-0000-000000000030': ['Exercise mat'], // Hamstring Stretch
};

function itemsForExercise(ex: Pick<Exercise, 'id' | 'equipment_tier'>): readonly string[] {
  const mapped = EXERCISE_EQUIPMENT[ex.id];
  if (mapped) return mapped;
  return TIER_FALLBACK[ex.equipment_tier] ?? [];
}

/** Deduplicated equipment list in session exercise order (first appearance wins). */
export function orderedEquipmentForExercises(
  exercises: Pick<Exercise, 'id' | 'equipment_tier'>[],
): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const ex of exercises) {
    for (const item of itemsForExercise(ex)) {
      if (!seen.has(item)) {
        seen.add(item);
        ordered.push(item);
      }
    }
  }

  if (ordered.length === 0) {
    return ['Bodyweight only'];
  }

  // If both singular and plural dumbbell labels appear, keep the more general one.
  if (seen.has('Dumbbell') && seen.has('Dumbbells')) {
    return ordered.filter((item) => item !== 'Dumbbell');
  }

  return ordered;
}
