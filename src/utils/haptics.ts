import * as Haptics from 'expo-haptics';

// trigger a light haptic tap - used on button presses and tab switches
export const triggerHaptic = async (): Promise<void> => {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // some devices don't support haptics, just ignore the error
  }
};
