import * as Haptics from 'expo-haptics';

export const triggerHaptic = async (): Promise<void> => {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // silently ignored — haptics are an enhancement, not a feature
  }
};
