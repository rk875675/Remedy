import { Stack } from 'expo-router';
import { colors } from '../../constants/colors';
import { screenTransitionOptions } from '../../constants/navigation';

// Welcome anchors the group, so replacing straight onto a deep route (the lapsed
// subscriber's jump to match) still leaves Welcome underneath for swipe-back.
export const unstable_settings = { anchor: 'index' };

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        gestureEnabled: true,
        ...screenTransitionOptions,
      }}
    />
  );
}
