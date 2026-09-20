import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../constants/colors';
import { TabBarIcon } from '../../components/ui/TabBarIcon';
import { hapticTabSwitch } from '../../lib/haptics';
import { usePremium } from '../../context/PremiumContext';
import {
  TAB_BAR_HEIGHT,
  TAB_BAR_PADDING_BOTTOM,
  TAB_BAR_PADDING_TOP,
  TAB_LABEL_SIZE,
  tabTransitionOptions,
} from '../../constants/navigation';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, TAB_BAR_PADDING_BOTTOM);
  const router = useRouter();
  const { premium, onboardingDone } = usePremium();

  useEffect(() => {
    if (onboardingDone === true && premium === false) {
      router.replace('/(onboarding)/match?lapsed=1', { withAnchor: true });
    }
  }, [premium, onboardingDone, router]);

  return (
    <Tabs
      detachInactiveScreens={false}
      screenOptions={{
        lazy: false,
        headerShown: false,
        ...tabTransitionOptions,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: TAB_BAR_HEIGHT + bottomPad,
          paddingBottom: bottomPad,
          paddingTop: TAB_BAR_PADDING_TOP,
          shadowColor: '#1C1C1E',
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.12,
          shadowRadius: 16,
          elevation: 12,
        },
        tabBarLabelStyle: {
          fontSize: TAB_LABEL_SIZE,
          fontWeight: '600',
          letterSpacing: 0.1,
        },
      }}
      screenListeners={{
        tabPress: () => {
          hapticTabSwitch();
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon
              focused={focused}
              color={color}
              outlineName="home-outline"
              filledName="home"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon
              focused={focused}
              color={color}
              outlineName="stats-chart-outline"
              filledName="stats-chart"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon
              focused={focused}
              color={color}
              outlineName="person-circle-outline"
              filledName="person-circle"
            />
          ),
        }}
      />
    </Tabs>
  );
}
