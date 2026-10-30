/**
 * Root Layout
 * Wraps the entire app with AuthProvider and ThemeProvider.
 * Redirects to auth or main based on auth state.
 */

import "../global.css";
import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import { AuthProvider, useAuth } from "../lib/auth";
import { ThemeProvider, useTheme } from "../lib/theme";
import { warmUpBackend } from "../lib/api";

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { session, isLoading } = useAuth();
  const { theme } = useTheme();
  const segments = useSegments();
  const router = useRouter();

  console.log("[RootLayoutNav] isLoading:", isLoading, "session:", !!session, "segments:", segments);

  // Silent cold-start ping + safety fallback to ensure splash screen hides within 2.5s
  useEffect(() => {
    void warmUpBackend();
    const splashTimer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 2500);
    return () => clearTimeout(splashTimer);
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "(auth)";
    console.log("[RootLayoutNav] Redirect check — inAuthGroup:", inAuthGroup, "session:", !!session);

    if (!session && !inAuthGroup) {
      router.replace("/(auth)/register");
    } else if (session && inAuthGroup) {
      router.replace("/(main)/chat");
    }

    // Hide splash screen once loading is complete and routing is handled
    SplashScreen.hideAsync().catch(() => {});
  }, [session, isLoading, segments, router]);

  // Show loading spinner while checking auth
  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: theme.background,
        }}
      >
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={theme.statusBarStyle} />
      <Slot />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <RootLayoutNav />
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
