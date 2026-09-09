/**
 * Supabase Client for Mobile
 * Uses AsyncStorage for session persistence and SecureStore for tokens.
 */


import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// ─── Configuration ──────────────────────────────────────────
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "https://lvolxrcufdqllvpfzsxd.supabase.co";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2b2x4cmN1ZmRxbGx2cGZ6c3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NzQ0MTMsImV4cCI6MjA4NjU1MDQxM30.60h0UCxYOjglsgi-PO75dN1hOk7iWSAmUxBGJ8Ckc2A";

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
