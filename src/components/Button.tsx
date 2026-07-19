import React, { useRef } from 'react';
import {
  Pressable, Text, ActivityIndicator, StyleSheet,
  Animated, View, ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/fonts';
import { radii } from '../theme/spacing';
import { triggerHaptic } from '../utils/haptics';

type ButtonVariant = 'primary' | 'secondary' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  leftIcon?: React.ReactNode;
  onPress: () => void;
  children: React.ReactNode;
  style?: ViewStyle;
}

const HEIGHT_MAP: Record<ButtonSize, number> = { sm: 36, md: 44, lg: 52 };

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  leftIcon,
  onPress,
  children,
  style,
}: ButtonProps) {
  const { colors } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    triggerHaptic();
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      stiffness: 300,
      damping: 20,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      stiffness: 300,
      damping: 20,
    }).start();
  };

  const isDisabled = (disabled && !loading) || loading;
  const height = HEIGHT_MAP[size];

  const variantStyle = (() => {
    switch (variant) {
      case 'primary':
        return { backgroundColor: colors.purpleStrong, borderWidth: 0 };
      case 'secondary':
        return { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.purple };
      case 'destructive':
        return { backgroundColor: 'rgba(248,113,113,0.12)', borderWidth: 1, borderColor: colors.danger };
    }
  })();

  const textColor = (() => {
    switch (variant) {
      case 'primary': return colors.white;
      case 'secondary': return colors.purple;
      case 'destructive': return colors.danger;
    }
  })();

  const indicatorColor = variant === 'primary' ? colors.white : textColor;

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
      <Pressable
        onPress={isDisabled ? undefined : onPress}
        onPressIn={isDisabled ? undefined : handlePressIn}
        onPressOut={handlePressOut}
        style={({ pressed }) => [
          styles.base,
          variantStyle,
          { height, minHeight: height, borderRadius: radii.lg },
          (disabled && !loading) && styles.disabled,
          pressed && !isDisabled && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, busy: loading }}
      >
        {loading ? (
          <ActivityIndicator color={indicatorColor} size="small" />
        ) : (
          <View style={styles.content}>
            {leftIcon && <View style={styles.iconWrap}>{leftIcon}</View>}
            <Text style={[styles.label, { color: textColor }]}>{children}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    marginRight: 8,
  },
  label: {
    fontFamily: fonts.semiBold,
    fontWeight: '600',
    fontSize: 15,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.75,
  },
});
