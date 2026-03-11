export interface ThemeColors {
  name: string;
  label: string;
  bg900: string;
  bg800: string;
  bg700: string;
  bg600: string;
  bg500: string;
  text400: string;
  text300: string;
  text200: string;
  text100: string;
  accent: string;
  accentLight: string;
  accentGlow: string;
  success: string;
  warning: string;
  danger: string;
  barBg: string;
  barParentBg: string;
  gridLine: string;
  headerText: string;
  subHeaderText: string;
  rowAlt: string;
}

export const THEMES: Record<string, ThemeColors> = {
  light: {
    name: 'light',
    label: 'ライト',
    bg900: '#f5f6fa',
    bg800: '#ffffff',
    bg700: '#eef0f6',
    bg600: '#dde0ec',
    bg500: '#c5c9db',
    text400: '#8b90a8',
    text300: '#6b7094',
    text200: '#4a4f6e',
    text100: '#1e2240',
    accent: '#5b4fd6',
    accentLight: '#7b6ff0',
    accentGlow: 'rgba(91,79,214,0.2)',
    success: '#059669',
    warning: '#d97706',
    danger: '#dc2626',
    barBg: '#dde0ec',
    barParentBg: '#c5c9db',
    gridLine: '#eef0f6',
    headerText: '#4a4f6e',
    subHeaderText: '#8b90a8',
    rowAlt: 'rgba(0,0,0,0.02)',
  },
  dark: {
    name: 'dark',
    label: 'ダーク',
    bg900: '#0c0e14',
    bg800: '#12151e',
    bg700: '#1a1e2e',
    bg600: '#242940',
    bg500: '#2e3552',
    text400: '#4a5280',
    text300: '#6b74a8',
    text200: '#9ba3cc',
    text100: '#c8cde6',
    accent: '#7c6aef',
    accentLight: '#9d8ff5',
    accentGlow: 'rgba(124,106,239,0.3)',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    barBg: '#1a1e2e',
    barParentBg: '#2e3552',
    gridLine: '#1a1e2e',
    headerText: '#6b74a8',
    subHeaderText: '#4a5280',
    rowAlt: 'rgba(255,255,255,0.01)',
  },
  pop: {
    name: 'pop',
    label: 'ポップ',
    bg900: '#fef7ff',
    bg800: '#fff0fb',
    bg700: '#fce4f6',
    bg600: '#f5c6eb',
    bg500: '#e8a8d8',
    text400: '#b06e9f',
    text300: '#8e4d7d',
    text200: '#6d2e5e',
    text100: '#4a1040',
    accent: '#e44bc6',
    accentLight: '#f472d0',
    accentGlow: 'rgba(228,75,198,0.25)',
    success: '#22c55e',
    warning: '#facc15',
    danger: '#f43f5e',
    barBg: '#fce4f6',
    barParentBg: '#f5c6eb',
    gridLine: '#fce4f6',
    headerText: '#8e4d7d',
    subHeaderText: '#b06e9f',
    rowAlt: 'rgba(228,75,198,0.03)',
  },
  wild: {
    name: 'wild',
    label: 'ワイルド',
    bg900: '#110d0a',
    bg800: '#1a1410',
    bg700: '#261e18',
    bg600: '#352a20',
    bg500: '#4a3a2c',
    text400: '#7a6450',
    text300: '#a08468',
    text200: '#c8a882',
    text100: '#e8d4b8',
    accent: '#c0392b',
    accentLight: '#e74c3c',
    accentGlow: 'rgba(192,57,43,0.3)',
    success: '#27ae60',
    warning: '#e67e22',
    danger: '#c0392b',
    barBg: '#261e18',
    barParentBg: '#352a20',
    gridLine: '#261e18',
    headerText: '#a08468',
    subHeaderText: '#7a6450',
    rowAlt: 'rgba(255,255,255,0.015)',
  },
};

export type ThemeName = keyof typeof THEMES;

const THEME_STORAGE_KEY = 'gantt-app-theme';

export function loadTheme(): ThemeName {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved && saved in THEMES) return saved as ThemeName;
  } catch (_e) { /* noop */ }
  return 'light';
}

export function saveTheme(name: ThemeName): void {
  localStorage.setItem(THEME_STORAGE_KEY, name);
}
