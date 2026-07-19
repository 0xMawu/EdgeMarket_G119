import React from 'react';
import { Platform, View, Text, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Trophy, Star, User, Zap, Compass } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { LeaderboardScreen } from '../screens/LeaderboardScreen';
import { FollowingScreen } from '../screens/FollowingScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SignalFeedScreen } from '../screens/SignalFeedScreen';
import { DiscoverScreen } from '../screens/DiscoverScreen';
import { useFollowing } from '../hooks/useFollowing';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/fonts';
import { radii } from '../theme/spacing';
import { triggerHaptic } from '../utils/haptics';

// Phase 4: simplified from 6 tabs to 5. "All" and "Top" were merged into a
// single "Leaderboard" tab (see LeaderboardScreen.tsx).
export type RootTabParamList = {
  Leaderboard: undefined;
  Following: undefined;
  Signals: undefined;
  Discover: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

function FollowingTabIcon({ color, size }: { color: string; size: number }) {
  const { colors } = useTheme();
  const { followingIds } = useFollowing();
  const count = followingIds.length;
  return (
    <View>
      <Star color={color} size={size} />
      {count > 0 && (
        <View style={[styles.badge, { backgroundColor: colors.purple }]}>
          <Text style={[styles.badgeText, { fontFamily: fonts.bold }]}>
            {count > 99 ? '99+' : count}
          </Text>
        </View>
      )}
    </View>
  );
}

export function RootNavigator() {
  const { colors, isDark } = useTheme();

  const tabBarBackground =
    Platform.OS === 'ios'
      ? () => (
          <BlurView
            intensity={80}
            tint={isDark ? 'dark' : 'light'}
            style={[StyleSheet.absoluteFill, { borderRadius: radii.xxl }]}
          />
        )
      : undefined;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.purple,
        tabBarInactiveTintColor: colors.textFainter,
        tabBarBackground,
        tabBarStyle: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 16,
          height: 70,
          borderRadius: radii.xxl,
          backgroundColor:
            Platform.OS === 'ios' ? 'transparent' : colors.tabBar,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          paddingTop: 8,
          paddingBottom: 10,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontFamily: fonts.medium,
        },
      }}
    >
      <Tab.Screen
        name="Leaderboard"
        component={LeaderboardScreen}
        options={{
          tabBarLabel: 'Leaderboard',
          tabBarIcon: ({ color }) => <Trophy color={color} size={22} />,
        }}
        listeners={{
          tabPress: () => triggerHaptic(),
        }}
      />
      <Tab.Screen
        name="Following"
        component={FollowingScreen}
        options={{
          tabBarLabel: 'Following',
          tabBarIcon: ({ color }) => (
            <FollowingTabIcon color={color} size={22} />
          ),
        }}
        listeners={{
          tabPress: () => triggerHaptic(),
        }}
      />
      <Tab.Screen
        name="Signals"
        component={SignalFeedScreen}
        options={{
          tabBarLabel: 'Signals',
          tabBarIcon: ({ color }) => <Zap color={color} size={22} />,
        }}
        listeners={{
          tabPress: () => triggerHaptic(),
        }}
      />
      <Tab.Screen
        name="Discover"
        component={DiscoverScreen}
        options={{
          tabBarLabel: 'Discover',
          tabBarIcon: ({ color }) => <Compass color={color} size={22} />,
        }}
        listeners={{
          tabPress: () => triggerHaptic(),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color }) => <User color={color} size={22} />,
        }}
        listeners={{
          tabPress: () => triggerHaptic(),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    borderRadius: radii.full,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
});
