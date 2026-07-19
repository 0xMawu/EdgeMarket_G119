// all app colors in one place

export const colors = {
  gradientStart: "#0a0f2e",
  gradientMid:   "#0d1b4b",
  gradientEnd:   "#1a0a3e",
  card: "rgba(255,255,255,0.07)",
  cardBorder: "rgba(255,255,255,0.09)",
  tabBar: "#080d24",
  white: "#ffffff",
  textMuted: "rgba(255,255,255,0.6)",
  textFaint: "rgba(255,255,255,0.5)",
  textFainter: "rgba(255,255,255,0.35)",
  purple: "#7c3aed",
  purpleStrong: "#6d28d9",
  purpleLight: "#a78bfa",
  green: "#4ade80",
  red: "#f87171",
  yellow: "#facc15",
  orange: "#fb923c",
  blue: "#3b82f6",
  blueLight: "#60a5fa",
  gray: "#9ca3af",
};

export type Colors = typeof colors;

// ThemeColors is used by darkColors and lightColors
export interface ThemeColors {
  white: string;
  black: string;
  textPrimary: string;
  textMuted: string;
  textFaint: string;
  textFainter: string;
  card: string;
  cardBorder: string;
  purple: string;
  purpleStrong: string;
  green: string;
  red: string;
  blue: string;
  yellow: string;
  gradientStart: string;
  gradientMid: string;
  gradientEnd: string;
  surface: string;
  surfaceHighlight: string;
  border: string;
  borderStrong: string;
  success: string;
  danger: string;
  warning: string;
  info: string;
  tabBar: string;
}

// dark mode palette
export const darkColors: ThemeColors = {
  gradientStart: '#0B0F1E',
  gradientMid:   '#111827',
  gradientEnd:   '#0D0B1E',
  card:             'rgba(255,255,255,0.06)',
  cardBorder:       'rgba(255,255,255,0.09)',
  surface:          '#141824',
  surfaceHighlight: '#1E2433',
  border:           'rgba(255,255,255,0.09)',
  borderStrong:     'rgba(255,255,255,0.18)',
  tabBar:           '#0D1117',
  white: '#FFFFFF',
  black: '#000000',
  textPrimary: '#FFFFFF',
  textMuted:    'rgba(255,255,255,0.6)',
  textFaint:    'rgba(255,255,255,0.45)',
  textFainter:  'rgba(255,255,255,0.3)',
  purple:       '#A78BFA',
  purpleStrong: '#7C3AED',
  green:   '#4ADE80',
  red:     '#F87171',
  blue:    '#60A5FA',
  yellow:  '#EAB308',
  success: '#4ADE80',
  danger:  '#F87171',
  warning: '#FACC15',
  info:    '#60A5FA',
};

// light mode palette
export const lightColors: ThemeColors = {
  gradientStart: '#F0F4FF',
  gradientMid:   '#F8F9FC',
  gradientEnd:   '#FFF8F5',
  card:             '#FFFFFF',
  cardBorder:       'rgba(15,23,42,0.08)',
  surface:          '#F8F9FC',
  surfaceHighlight: '#EEF2FF',
  border:           'rgba(15,23,42,0.08)',
  borderStrong:     'rgba(15,23,42,0.2)',
  tabBar:           '#FFFFFF',
  white: '#FFFFFF',
  black: '#000000',
  textPrimary:  '#0F172A',
  textMuted:    'rgba(15,23,42,0.65)',
  textFaint:    'rgba(15,23,42,0.45)',
  textFainter:  'rgba(15,23,42,0.28)',
  purple:       '#6D28D9',
  purpleStrong: '#7C3AED',
  green:   '#15803D',
  red:     '#B91C1C',
  blue:    '#1D4ED8',
  yellow:  '#B45309',
  success: '#15803D',
  danger:  '#B91C1C',
  warning: '#B45309',
  info:    '#1D4ED8',
};
