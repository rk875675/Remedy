import { useEffect, useState } from 'react';

import type { PetStage } from '../constants/petImages';
import { useAuth } from '../context/AuthContext';
import { useOnboarding } from '../context/OnboardingContext';
import type { PetState } from './pet';
import { fetchPetState } from './petApi';

// One fetch per signed-in user per app run is enough for the onboarding screens.
const cache = new Map<string, PetState>();
const inFlight = new Map<string, Promise<PetState | null>>();

/**
 * The pet to draw on onboarding screens.
 * New users have no account yet: their pet is the stage-1 ball with the name they
 * typed on the naming screen. Signed-in users (retaking the quiz, or returning
 * after a lapse) already have a pet on the server, so theirs is used instead.
 */
export function useOnboardingPet(): { stage: PetStage; name: string | null } {
  const { user } = useAuth();
  const { progress } = useOnboarding();
  const userId = user?.id ?? null;
  const [server, setServer] = useState<PetState | null>(userId ? cache.get(userId) ?? null : null);

  useEffect(() => {
    if (!userId) {
      setServer(null);
      return;
    }
    const cached = cache.get(userId);
    if (cached) {
      setServer(cached);
      return;
    }
    let live = true;
    let request = inFlight.get(userId);
    if (!request) {
      request = fetchPetState().finally(() => inFlight.delete(userId));
      inFlight.set(userId, request);
    }
    void request.then((state) => {
      if (!state) return;
      cache.set(userId, state);
      if (live) setServer(state);
    });
    return () => {
      live = false;
    };
  }, [userId]);

  return {
    stage: server?.stage ?? 1,
    name: server?.name ?? progress?.pet_name ?? null,
  };
}
