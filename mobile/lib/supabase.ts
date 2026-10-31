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
// Native: encrypted SecureStore (iOS Keychain / Android Keystore).
// Web: standard localStorage.
// SecureStore values are limited to ~2KB, and Supabase sessions often exceed
// that, so values are split into chunks: `${key}.n` holds the chunk count and
// `${key}.0..n-1` hold the chunk data.
const CHUNK_SIZE = 1800;
const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

async function secureRemove(key: string): Promise<void> {
  const countRaw = await SecureStore.getItemAsync(`${key}.n`);
  const count = countRaw ? parseInt(countRaw, 10) || 0 : 0;
  for (let i = 0; i < count; i++) {
    await SecureStore.deleteItemAsync(`${key}.${i}`);
  }
  await SecureStore.deleteItemAsync(`${key}.n`);
}

async function secureSet(key: string, value: string): Promise<void> {
  await secureRemove(key);
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) {
    chunks.push(value.slice(i, i + CHUNK_SIZE));
  }
  for (let i = 0; i < chunks.length; i++) {
    await SecureStore.setItemAsync(`${key}.${i}`, chunks[i], SECURE_OPTIONS);
  }
  await SecureStore.setItemAsync(`${key}.n`, String(chunks.length), SECURE_OPTIONS);
}

async function secureGet(key: string): Promise<string | null> {
  const countRaw = await SecureStore.getItemAsync(`${key}.n`);
  if (countRaw === null) return null;
  const count = parseInt(countRaw, 10) || 0;
  let value = "";
  for (let i = 0; i < count; i++) {
    const chunk = await SecureStore.getItemAsync(`${key}.${i}`);
    if (chunk === null) return null; // corrupted / partially written
    value += chunk;
  }
  return value;
}

const SecureStoreAdapter = {
  getItem: async (key: string) => {
    if (Platform.OS === "web") {
      try { return window.localStorage.getItem(key); } catch (e) { return null; }
    }
    try {
      const value = await secureGet(key);
      if (value !== null) return value;

      // One-time migration: move any legacy plaintext session out of AsyncStorage.
      const legacy = await AsyncStorage.getItem(key);
      if (legacy !== null) {
        await secureSet(key, legacy);
        await AsyncStorage.removeItem(key);
      }
      return legacy;
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
      await secureSet(key, value);
    } catch (e) {}
  },
  removeItem: async (key: string) => {
    if (Platform.OS === "web") {
      try { window.localStorage.removeItem(key); } catch (e) {}
      return;
    }
    try {
      await secureRemove(key);
      await AsyncStorage.removeItem(key); // clear any legacy copy too
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
    flowType: "pkce",
  },
});

export default supabase;
