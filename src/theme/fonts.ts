import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';

// pass this to useFonts() in App.tsx
export const fontAssets = {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
};

// use these font family names in StyleSheet
export const fonts = {
  regular:  'PlusJakartaSans_400Regular',
  medium:   'PlusJakartaSans_500Medium',
  semiBold: 'PlusJakartaSans_600SemiBold',
  bold:     'PlusJakartaSans_700Bold',
} as const;

export type Fonts = typeof fonts;
