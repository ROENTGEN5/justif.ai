/**
 * ThemeContext
 * Provides app-wide theme switching between Light, Dark, and Night modes.
 * Persists the user's preference to AsyncStorage.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ThemePalettes, ThemeMode, ThemeColors } from "../constants/Colors";

const THEME_STORAGE_KEY = "@justifai_theme";

interface ThemeContextValue {
  mode: ThemeMode;
  theme: ThemeColors;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "light",
  theme: ThemePalettes.light,
  setMode: () => {},
});

// Safe storage wrapper that works on both native and web
const getThemeStorage = async () => {
  if (Platform.OS === "web") {
    try { return window.localStorage.getItem(THEME_STORAGE_KEY); } catch (e) { return null; }
  }
  return await AsyncStorage.getItem(THEME_STORAGE_KEY);
};

const setThemeStorage = async (mode: string) => {
  if (Platform.OS === "web") {
    try { window.localStorage.setItem(THEME_STORAGE_KEY, mode); } catch (e) {}
    return;
  }
  await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("light");

  useEffect(() => {
    // Load saved theme on mount
    getThemeStorage().then((stored) => {
      if (stored && (stored === "light" || stored === "dark" || stored === "night")) {
        setModeState(stored as ThemeMode);
      }
    });
  }, []);

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);
    setThemeStorage(newMode);
  };

  const theme = ThemePalettes[mode];

  return (
    <ThemeContext.Provider value={{ mode, theme, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export default ThemeContext;
