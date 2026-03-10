import { createContext, useContext } from 'react';
import type { ThemeColors } from './theme';
import { THEMES } from './theme';

export const ThemeContext = createContext<ThemeColors>(THEMES.dark);

export function useTheme(): ThemeColors {
  return useContext(ThemeContext);
}
