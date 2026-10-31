// Compatibility wrapper for older screens: use the shared brand artwork.
import React from "react";
import { Text, View } from "react-native";
import BrandLogo from "./BrandLogo";
import { useTheme } from "../lib/theme";
import { Strings } from "../constants/Strings";
export default function LogoPlaceholder({ size = "medium", showTagline = false }: { size?: "small" | "medium" | "large"; showTagline?: boolean }) {
  const { theme } = useTheme();
  return <View style={{ alignItems: "center", gap: 12 }}>
    <BrandLogo size={{ small: 48, medium: 80, large: 120 }[size]} />
    {showTagline && <Text style={{ color: theme.textSecondary, textAlign: "center" }}>{Strings.tagline}</Text>}
  </View>;
}
