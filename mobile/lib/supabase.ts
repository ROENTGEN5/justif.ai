/**
 * Supabase Client for Mobile
 * Uses AsyncStorage for session persistence and SecureStore for tokens.
 */


import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// ─── Configuration ──────────────────────────────────────────
// Replace these with your actual Supabase project credentials
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "https://your-project.supabase.co";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "your-anon-key";

// ─── Secure Storage Adapter ────────────────────────────────
// Uses AsyncStorage on native, standard localStorage on web
const SecureStoreAdapter = {
  getItem: async (key: string) => {
    if (Platform.OS === "web") {
      try { return window.localStorage.getItem(key); } catch (e) { return null; }
    }
    try {
      return await AsyncStorage.getItem(key);
    } catch (e) {
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    if (Platform.OS === "web") {
      try { window.localStorage.setItem(key, value); } catch (e) {}
      return;
    }
    try {
      await AsyncStorage.setItem(key, value);
    } catch (e) {}
  },
  removeItem: async (key: string) => {
    if (Platform.OS === "web") {
      try { window.localStorage.removeItem(key); } catch (e) {}
      return;
    }
    try {
      await AsyncStorage.removeItem(key);
    } catch (e) {}
  },
};

// ─── Supabase Client ───────────────────────────────────────
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export default supabase;
