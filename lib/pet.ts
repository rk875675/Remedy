// Pet rules with no I/O, so scripts/verify_pet.ts can run them in Node.
// Server calls live in lib/petApi.ts.
import { z } from 'zod';

import type { PetMood } from '../constants/petImages';

export const petStateSchema = z
  .object({
    name: z.string().nullable(),
    stage: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    total_sessions: z.number().int().min(0),
    last_completed_at: z.string().nullable(),
    thresholds: z.array(z.number().int().min(0)).length(5),
  })
  .strict();

export type PetState = z.infer<typeof petStateSchema>;

/** Sessions still needed to reach the next stage; null once fully grown. */
export function sessionsUntilNextStage(state: PetState): number | null {
  if (state.stage >= 5) return null;
  const next = state.thresholds[state.stage] ?? state.total_sessions + 1;
  return Math.max(1, next - state.total_sessions);
}

/** 0..1 progress from the current stage's threshold to the next one. */
export function stageProgress(state: PetState): number {
  if (state.stage >= 5) return 1;
  const from = state.thresholds[state.stage - 1] ?? 0;
  const to = state.thresholds[state.stage];
  if (to == null || to <= from) return 0;
  return Math.min(1, Math.max(0, (state.total_sessions - from) / (to - from)));
}

/** The line under the pet on Home, e.g. "3 sessions until Biscuit grows". */
export function petGrowthCopy(state: PetState): string {
  const left = sessionsUntilNextStage(state);
  if (left === null) return state.name ? `${state.name} is fully grown` : 'Fully grown';
  const sessions = left === 1 ? '1 session' : `${left} sessions`;
  return `${sessions} until ${state.name ?? 'it'} grows`;
}

export type PetMoodInput = {
  programComplete: boolean;
  isDoneToday: boolean;
  hasSessionToday: boolean;
  isRestDay: boolean;
  missedPlannedDays: number;
  hour: number;
};

export function derivePetMood(input: PetMoodInput): PetMood {
  const night = input.hour >= 22 || input.hour < 5;
  if (input.programComplete) return 'proud';
  if (input.isDoneToday) return night ? 'sleepy' : 'idle';
  if (input.hasSessionToday) return input.missedPlannedDays >= 1 ? 'stiff' : 'ready';
  if (input.isRestDay) return 'sleepy';
  return night ? 'sleepy' : 'idle';
}
