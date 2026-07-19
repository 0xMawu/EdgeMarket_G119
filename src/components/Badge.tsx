import React from 'react';
import { Text, View, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/fonts';
import { radii } from '../theme/spacing';

type BadgeVariant = 'default' | 'success' | 'danger' | 'warning' | 'info' | 'purple';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  style?: ViewStyle;
}

export function Badge({ label, variant = 'default', size = 'sm', style }: BadgeProps) {
  const { colors } = useTheme();

  const variantStyles = {
    default:     { bg: colors.surface,                  text: colors.textMuted,  border: colors.border },
    success:     { bg: 'rgba(74,222,128,0.12)',          text: colors.success,    border: 'rgba(74,222,128,0.3)' },
    danger:      { bg: 'rgba(248,113,113,0.12)',         text: colors.danger,     border: 'rgba(248,113,113,0.3)' },
    warning:     { bg: 'rgba(250,204,21,0.12)',          text: colors.warning,    border: 'rgba(250,204,21,0.3)' },
    info:        { bg: 'rgba(96,165,250,0.12)',          text: colors.info,       border: 'rgba(96,165,250,0.3)' },
    purple:      { bg: 'rgba(124,58,237,0.2)',           text: colors.purple,     border: 'rgba(167,139,250,0.4)' },
  };

  const v = variantStyles[variant];
  const isMd = size === 'md';

  return (
    <View style={[
      styles.base,
      {
        backgroundColor: v.bg,
        borderColor: v.border,
        borderRadius: isMd ? radii.sm : radii.xs,
        paddingHorizontal: isMd ? 10 : 8,
        paddingVertical: isMd ? 5 : 3,
      },
      style,
    ]}>
      <Text style={[
        styles.label,
        { color: v.text, fontSize: isMd ? 12 : 10 },
      ]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  label: {
    fontFamily: fonts.semiBold,
    fontWeight: '600',
  },
});
