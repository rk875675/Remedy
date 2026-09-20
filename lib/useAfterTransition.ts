import { useEffect, useState } from 'react';
import { InteractionManager } from 'react-native';

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
    return () => task.cancel();
  }, []);

  return ready;
}
