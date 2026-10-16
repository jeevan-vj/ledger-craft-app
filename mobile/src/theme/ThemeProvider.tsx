import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { control, createTypography, darkPalette, lightPalette, motion, radius, space, type ThemePalette } from './tokens';

export interface AppTheme {
  isDark: boolean;
  colors: ThemePalette;
  space: typeof space;
  radius: typeof radius;
  control: typeof control;
  motion: typeof motion;
  type: ReturnType<typeof createTypography>;
}

const fallbackTheme: AppTheme = {
  isDark: true, colors: darkPalette, space, radius, control, motion, type: createTypography(darkPalette),
};
const ThemeContext = createContext<AppTheme>(fallbackTheme);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const value = useMemo<AppTheme>(() => {
    const isDark = scheme !== 'light';
    const colors = isDark ? darkPalette : lightPalette;
    return { isDark, colors, space, radius, control, motion, type: createTypography(colors) };
  }, [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() { return useContext(ThemeContext); }
