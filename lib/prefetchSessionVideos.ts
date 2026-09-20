import { supabase } from './supabase';
import { prefetchVideo } from './videoCache';

type ExerciseIdRow = {
  exercise_id: string | null;
};

/**
 * Fire-and-forget: download today's session clips into the on-device cache
 * while the user is still on Home, so the player opens on a file:// URI.
 *
 * Playback URLs are resolved by the get-video-url edge function, not read from
 * exercises.video_url. The column holds a public custom-domain URL, so using it here
 * meant the cache was warmed over an unauthenticated path that ignored the entitlement
 * gate; going through the function also means this picks up signed URLs automatically
 * once R2 credentials are configured.
 */
export function prefetchSessionVideos(planSessionId: string): void {
  void supabase
    .from('user_plan_session_exercises')
    .select('exercise_id')
    .eq('plan_session_id', planSessionId)
    .then(({ data, error }) => {
      if (error || !data) return;
      const exerciseIds = (data as unknown as ExerciseIdRow[])
        .map((row) => row.exercise_id)
        .filter((id): id is string => !!id);
      if (exerciseIds.length === 0) return;

      void supabase.functions
        .invoke('get-video-url', { body: { exerciseIds } })
        .then(({ data: res, error: fnError }) => {
          if (fnError || !res?.urls) return;
          for (const url of Object.values(res.urls as Record<string, string>)) {
            void prefetchVideo(url);
          }
        })
        .catch(() => {
          // Prefetch is best-effort; the player resolves its own URLs on open.
        });
    });
}
