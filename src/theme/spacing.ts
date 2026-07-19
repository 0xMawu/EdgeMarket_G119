import { StyleSheet } from 'react-native';

// spacing scale (4pt grid)
export const spacing = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   24,
  xxl:  32,
  xxxl: 48,
} as const;

// border radius scale
export const radii = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  24,
  full: 9999,
} as const;

// border widths
export const borderWidths = {
  thin:    StyleSheet.hairlineWidth,
  default: 1,
  thick:   2,
} as const;
