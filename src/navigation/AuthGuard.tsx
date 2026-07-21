import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { RootNavigator } from './RootNavigator';
import { AuthNavigator } from './AuthNavigator';
import { colors } from '../theme/colors';

// shows a spinner while loading, then routes to the right navigator
export function AuthGuard() {
  const { authState } = useAuth();

  if (authState === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gradientStart }}>
        <ActivityIndicator size="large" color={colors.purple} />
      </View>
    );
  }

  if (authState === 'authenticated') {
    return <RootNavigator />;
  }

  return <AuthNavigator />;
}
