/**
 * Root Layout
 * Wraps the entire app with AuthProvider and ThemeProvider.
 * Redirects to auth or main based on auth state.
 */

import "../global.css";
import React, { useEffect } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import { AuthProvider, useAuth } from "../lib/auth";
import { ThemeProvider, useTheme } from "../lib/theme";
import { warmUpBackend } from "../lib/api";
import { authDestination } from "../lib/authRouting";
import { AuthButton, AuthTextAction } from "../components/AuthForm";

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { session, isLoading, sessionError, retrySession } = useAuth();
  const { theme } = useTheme();
  const segments: readonly string[] = useSegments();
  const router = useRouter();

  const publicPrivacy = segments[0] === "(auth)" && segments[1] === "privacy-notice";

  // Silent cold-start ping + safety fallback to ensure splash screen hides within 2.5s
  useEffect(() => {
    void warmUpBackend();
    const splashTimer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 2500);
    return () => clearTimeout(splashTimer);
  }, []);

  useEffect(() => {
    if (isLoading || sessionError) return;

    // Recovery must exchange its one-use code before showing a password form.
    // Its temporary session must not redirect the user straight into chat.
    const destination = authDestination(!!session, segments);
    if (destination) router.replace(destination);

    // Hide splash screen once loading is complete and routing is handled
    SplashScreen.hideAsync().catch(() => {});
  }, [session, isLoading, sessionError, segments, router]);

  // Show loading spinner while checking auth
  if ((isLoading || sessionError) && !publicPrivacy) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: theme.background,
          padding: 24,
        }}
      >
        <View style={{ width: "100%", maxWidth: 420, gap: 20 }}>
          {isLoading ? <>
            <ActivityIndicator size="large" color={theme.accent} />
            <Text accessibilityLiveRegion="polite" style={{ color: theme.text, textAlign: "center", fontSize: 16 }}>Checking your sign-in...</Text>
          </> : <>
            <Text accessibilityRole="header" style={{ color: theme.text, textAlign: "center", fontSize: 22, fontWeight: "700" }}>Couldn&apos;t check your sign-in</Text>
            <Text accessibilityRole="alert" style={{ color: theme.textSecondary, textAlign: "center", fontSize: 15, lineHeight: 22 }}>{sessionError}</Text>
            <AuthButton title="Try again" onPress={retrySession} />
          </>}
          <AuthTextAction title="Privacy notice" onPress={() => router.push("/(auth)/privacy-notice")} />
        </View>
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
