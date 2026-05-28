import { Stack } from 'expo-router';
import { colors } from '../../constants/colors';
import { screenTransitionOptions } from '../../constants/navigation';

export default function SessionLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        gestureEnabled: false,
        ...screenTransitionOptions,
      }}
    />
  );
}
