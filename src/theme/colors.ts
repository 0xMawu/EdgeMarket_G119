// Central place for all colors used across the app.
// Keep this simple - just plain JS values, no theming library.

export const colors = {
  // Background gradient: deep navy blue merging into rich purple
  gradientStart: "#0a0f2e",  // deep navy
  gradientMid:   "#0d1b4b",  // dark royal blue
  gradientEnd:   "#1a0a3e",  // deep purple-navy

  // Surfaces
  card: "rgba(255,255,255,0.07)",
  cardBorder: "rgba(255,255,255,0.09)",
  tabBar: "#080d24",

  // Text
  white: "#ffffff",
  textMuted: "rgba(255,255,255,0.6)",
  textFaint: "rgba(255,255,255,0.5)",
  textFainter: "rgba(255,255,255,0.35)",

  // Accents
  purple: "#7c3aed",        // vibrant purple (Polymarket accent)
  purpleStrong: "#6d28d9",  // deeper purple
  purpleLight: "#a78bfa",   // soft purple
  green: "#4ade80",         // green-400
  red: "#f87171",           // red-400
  yellow: "#facc15",        // yellow-400/500
  orange: "#fb923c",        // orange-400/500
  blue: "#3b82f6",          // blue-500 (Polymarket brand blue)
  blueLight: "#60a5fa",     // blue-400
  gray: "#9ca3af",          // gray-400
};

export type Colors = typeof colors;

// theme/colors.ts
//
// Two full palettes: `darkColors` (the app's existing default look) and
// `lightColors` (a white-based palette for light mode). Any screen that
// previously did `import { colors } from '../theme/colors'` should switch
// to `const { colors } = useTheme()` from `./ThemeContext` so it re-renders
// when the mode changes.

export interface ThemeColors {
  // ── existing fields ──────────────────────────────────────────────────
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
  // ── new semantic tokens ───────────────────────────────────────────────
  surface: string;          // elevated card background
  surfaceHighlight: string; // hover/pressed card state
  border: string;           // default 1pt border
  borderStrong: string;     // emphasis border
  success: string;          // positive P&L, YES outcome
  danger: string;           // negative P&L, NO outcome
  warning: string;          // caution states
  info: string;             // informational states
  tabBar: string;           // tab bar background
}

// The app's original / default appearance — used for Dark Mode.
export const darkColors: ThemeColors = {
  // backgrounds
  gradientStart: '#0B0F1E',
  gradientMid:   '#111827',
  gradientEnd:   '#0D0B1E',
  // surfaces
  card:             'rgba(255,255,255,0.06)',
  cardBorder:       'rgba(255,255,255,0.09)',
  surface:          '#141824',
  surfaceHighlight: '#1E2433',
  border:           'rgba(255,255,255,0.09)',
  borderStrong:     'rgba(255,255,255,0.18)',
  tabBar:           '#0D1117',
  // text
  white: '#FFFFFF',
  black: '#000000',
  textPrimary: '#FFFFFF',
  textMuted:    'rgba(255,255,255,0.6)',
  textFaint:    'rgba(255,255,255,0.45)',
  textFainter:  'rgba(255,255,255,0.3)',
  // accents
  purple:       '#A78BFA',
  purpleStrong: '#7C3AED',
  green:   '#4ADE80',
  red:     '#F87171',
  blue:    '#60A5FA',
  yellow:  '#EAB308',
  // semantic
  success: '#4ADE80',
  danger:  '#F87171',
  warning: '#FACC15',
  info:    '#60A5FA',
};

// White-based palette — used for Light Mode.
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

