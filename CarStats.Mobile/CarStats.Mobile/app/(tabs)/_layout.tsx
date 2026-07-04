import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/context/ThemeContext';

export default function TabLayout() {
  const { colors: c } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: c.Dashboard.accent,
        tabBarInactiveTintColor: c.Dashboard.textSecondary,
        tabBarStyle: {
          backgroundColor: c.Dashboard.card,
          borderTopColor: c.Dashboard.cardBorder,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Garage',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="fuel"
        options={{
          title: 'Fuel',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="fuelpump.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'History',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="clock.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="navigate"
        options={{
          title: 'Mechanics',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="wrench.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="person.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
