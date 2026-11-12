import { createVideoPlayer, type VideoPlayer, type VideoPlayerStatus } from 'expo-video';

// Bundled bell. Played with the video player already in the app so a timed
// hold can ring without adding an audio package. duckOthers dips music only
// while the strike is playing, then lets it return.
const CHIME = require('../assets/audio/done-chime.wav') as number;

let player: VideoPlayer | null = null;
let playWhenReady = false;

function getPlayer(): VideoPlayer {
  if (player) return player;
  const created = createVideoPlayer(CHIME);
  created.loop = false;
  created.muted = false;
  created.volume = 1;
  created.audioMixingMode = 'duckOthers';
  created.showNowPlayingNotification = false;
  created.addListener('statusChange', ({ status }: { status: VideoPlayerStatus }) => {
    if (status === 'readyToPlay' && playWhenReady) {
      playWhenReady = false;
      created.currentTime = 0;
      created.play();
    }
  });
  player = created;
  return created;
}

/** One bell when a timed exercise's countdown reaches zero. */
export function playDoneChime(): void {
  try {
    const chime = getPlayer();
    if (chime.status === 'readyToPlay') {
      playWhenReady = false;
      chime.currentTime = 0;
      chime.play();
      return;
    }
    playWhenReady = true;
  } catch {
    // A missed bell must not stop the session timer.
  }
}
