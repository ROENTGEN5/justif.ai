/**
 * Auth Stack Layout
 * Stack navigator for Login and Register screens.
 */

import { Stack } from "expo-router";
import { useTheme } from "../../lib/theme";

export default function AuthLayout() {
  const { theme } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="resend-confirmation" />
      <Stack.Screen name="privacy-notice" />
    </Stack>
  );
}
