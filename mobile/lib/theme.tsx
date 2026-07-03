import { useColorScheme } from 'react-native';

export const lightTheme = {
  background: '#f9fafb',
  card: '#ffffff',
  text: '#111827',
  textSecondary: '#6b7280',
  border: '#e5e7eb',
  navy: '#0c2340',
  navyCard: '#0c2340',
  gold: '#c9912a',
  green: '#22c55e',
  inputBg: '#ffffff',
  tabBar: '#ffffff',
  emptyIcon: '#d1d5db',
  errorText: '#ef4444',
  successText: '#065f46',
  badgePendingBg: '#fef3c7',
  badgePendingText: '#92400e',
  badgeSuccessBg: '#d1fae5',
};

export const darkTheme = {
  background: '#121212',
  card: '#1e1e1e',
  text: '#f5f5f5',
  textSecondary: '#a3a3a3',
  border: '#2c2c2c',
  navy: '#e5e5e5', // Lighter grey for dark mode to replace navy text
  navyCard: '#1e1e1e', // Replaced dark blue with dark card color
  gold: '#fbbf24',
  green: '#4ade80',
  inputBg: '#2c2c2c',
  tabBar: '#121212',
  emptyIcon: '#525252',
  errorText: '#f87171',
  successText: '#34d399',
  badgePendingBg: '#451a03',
  badgePendingText: '#fde68a',
  badgeSuccessBg: '#064e3b',
};

export type Theme = typeof lightTheme;
export type ThemeMode = 'system' | 'light' | 'dark';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { storage } from './storage';

interface ThemeContextType {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  theme: Theme;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const scheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    storage.getTheme().then(m => { if (m) setModeState(m); });
  }, []);

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);
    storage.setTheme(newMode);
  };

  const isDark = mode === 'dark' || (mode === 'system' && scheme === 'dark');
  const theme = isDark ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ mode, setMode, theme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useAppThemeContext = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useAppThemeContext must be used within ThemeProvider');
  return ctx;
};

export const useAppTheme = (): Theme => {
  try {
    return useAppThemeContext().theme;
  } catch (e) {
    // Fallback if not wrapped (e.g. tests)
    const scheme = useColorScheme();
    return scheme === 'dark' ? darkTheme : lightTheme;
  }
};
