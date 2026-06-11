import { Stack } from 'expo-router';
import { colors } from '../../constants/colors';
import { screenTransitionOptions } from '../../constants/navigation';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        gestureEnabled: true,
        ...screenTransitionOptions,
      }}
    >
      <Stack.Screen name="disclaimer" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
