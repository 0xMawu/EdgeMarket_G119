import React, { useEffect } from 'react';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/context/AuthProvider';
import { AuthGuard } from './src/navigation/AuthGuard';
import { useFonts } from '@expo-google-fonts/plus-jakarta-sans';
import { fontAssets } from './src/theme/fonts';
import * as SplashScreen from 'expo-splash-screen';

// Keep splash screen visible while fonts load
SplashScreen.preventAutoHideAsync();

function AppContent() {
  const { isDark } = useTheme();
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  try {
    if (!fontsLoaded && !fontError) {
      return null;
    }
  } catch {
    // fontError is handled above; prevent any unexpected crash
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AuthProvider>
        <NavigationContainer>
          <AuthGuard />
        </NavigationContainer>
      </AuthProvider>
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <AppContent />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
