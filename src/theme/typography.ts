import { fonts } from './fonts';

// text style presets used throughout the app
export const typography = {
  displayLarge: {
    fontFamily: fonts.bold,
    fontWeight: '700' as const,
    fontSize: 32,
    lineHeight: 40,
  },
  heading: {
    fontFamily: fonts.semiBold,
    fontWeight: '600' as const,
    fontSize: 24,
    lineHeight: 30,
  },
  subheading: {
    fontFamily: fonts.semiBold,
    fontWeight: '600' as const,
    fontSize: 17,
    lineHeight: 22,
  },
  body: {
    fontFamily: fonts.regular,
    fontWeight: '400' as const,
    fontSize: 15,
    lineHeight: 22,
  },
  caption: {
    fontFamily: fonts.regular,
    fontWeight: '400' as const,
    fontSize: 12,
    lineHeight: 16,
  },
  label: {
    fontFamily: fonts.medium,
    fontWeight: '500' as const,
    fontSize: 13,
    lineHeight: 18,
  },
} as const;
