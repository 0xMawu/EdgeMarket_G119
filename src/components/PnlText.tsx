import React from 'react';
import { Text, View, StyleSheet, TextStyle } from 'react-native';
import { TrendingUp, TrendingDown } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/fonts';

interface PnlTextProps {
  value: number;
  showIcon?: boolean;
  style?: TextStyle;
  iconSize?: number;
}

// Named export for unit testing
export function formatPnlValue(value: number): string {
  if (value === 0) return '$0';
  const abs = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  if (value > 0) return `+$${abs}`;
  return `\u2013$${abs}`; // U+2013 EN DASH
}

export function PnlText({ value, showIcon = false, style, iconSize = 14 }: PnlTextProps) {
  const { colors } = useTheme();

  const color = value > 0 ? colors.success : value < 0 ? colors.danger : colors.textMuted;
  const formatted = formatPnlValue(value);

  return (
    <View style={styles.row}>
      {showIcon && value > 0 && <TrendingUp size={iconSize} color={colors.success} style={styles.icon} />}
      {showIcon && value < 0 && <TrendingDown size={iconSize} color={colors.danger} style={styles.icon} />}
      <Text style={[styles.text, { color }, style]}>{formatted}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 4,
  },
  text: {
    fontFamily: fonts.semiBold,
    fontWeight: '600',
    fontSize: 15,
  },
});
