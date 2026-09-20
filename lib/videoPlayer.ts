import { useVideoPlayer, type VideoPlayer, type VideoSource } from 'expo-video';

/**
 * Exercise clips are silent demos. Native expo-video defaults to `doNotMix`,
 * which pauses Spotify (and any other app audio) even when the player is muted.
 */
export function configureSilentVideoPlayer(player: VideoPlayer): void {
  player.audioMixingMode = 'mixWithOthers';
  player.muted = true;
  player.showNowPlayingNotification = false;
}

/** Same as `useVideoPlayer`, but never interrupts other apps' audio. */
export function useSilentVideoPlayer(
  source: VideoSource,
  setup?: (player: VideoPlayer) => void,
): VideoPlayer {
  return useVideoPlayer(source, (player) => {
    configureSilentVideoPlayer(player);
    setup?.(player);
  });
}
