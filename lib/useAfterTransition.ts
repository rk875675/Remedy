import { useEffect, useState } from 'react';
import { InteractionManager } from 'react-native';

/**
 * Longest we wait for InteractionManager before starting anyway. A JS-driven
 * looping animation anywhere in the stack (including a screen left mounted
 * underneath) holds an interaction handle open, and without this cap entrance
 * motion that waits here would never start.
 */
const MAX_WAIT_MS = 450;

/**
 * False until the current navigation transition (and other interactions)
 * have finished. Start looping / entrance motion only after this is true
 * so JS work does not hitch the screen slide.
 */
export function useAfterTransition(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setReady(true);
    });
    const fallback = setTimeout(() => setReady(true), MAX_WAIT_MS);
    return () => {
      task.cancel();
      clearTimeout(fallback);
    };
  }, []);

  return ready;
}
