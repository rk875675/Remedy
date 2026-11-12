import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// Asked once per app run; later mounts get the answer on their first render,
// so an entrance animation never has to start and then be cancelled.
let known: boolean | null = null;

/** The OS "Reduce Motion" setting. null until the OS has answered. */
export function useReduceMotion(): boolean | null {
  const [value, setValue] = useState<boolean | null>(known);

  useEffect(() => {
    let live = true;
    if (known === null) {
      void AccessibilityInfo.isReduceMotionEnabled()
        .then((enabled) => {
          known = enabled;
          if (live) setValue(enabled);
        })
        .catch(() => {
          known = false;
          if (live) setValue(false);
        });
    }
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      known = enabled;
      if (live) setValue(enabled);
    });
    return () => {
      live = false;
      sub.remove();
    };
  }, []);

  return value;
}
