import { Tabs } from 'expo-router';
import { colors } from '../../constants/colors';
import { TabBarIcon } from '../../components/ui/TabBarIcon';
import { hapticTabSwitch } from '../../lib/haptics';
import {
  TAB_BAR_HEIGHT,
  TAB_BAR_PADDING_BOTTOM,
  TAB_LABEL_SIZE,
} from '../../constants/navigation';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: '#E8E0DC',
          height: TAB_BAR_HEIGHT,
          paddingBottom: TAB_BAR_PADDING_BOTTOM,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: TAB_LABEL_SIZE,
          fontWeight: '500',
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
