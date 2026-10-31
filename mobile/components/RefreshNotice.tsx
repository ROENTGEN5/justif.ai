import React from "react";
import { Text } from "react-native";
import { useTheme } from "../lib/theme";

export default function RefreshNotice({ message }: { message: string }) {
  const { theme } = useTheme();
  return message ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ padding: 12, color: theme.textSecondary, backgroundColor: theme.surfaceElevated, fontSize: 13, lineHeight: 19 }}>{message}</Text> : null;
}
