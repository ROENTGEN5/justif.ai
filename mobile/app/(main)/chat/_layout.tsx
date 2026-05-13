/**
 * Chat Stack Layout
 * Handles navigation between new chat and existing chat screens.
 */

import { Stack } from "expo-router";
import { useTheme } from "../../../lib/theme";

export default function ChatLayout() {
  const { theme } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
