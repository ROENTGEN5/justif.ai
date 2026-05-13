/**
 * LogoPlaceholder Component
 * Stylized "J" logo with minimalist design.
 * Uses pure React Native for the logo design.
 */

import React from "react";
import { View, Text } from "react-native";
import Strings from "../constants/Strings";
import { useTheme } from "../lib/theme";

interface LogoPlaceholderProps {
  size?: "small" | "medium" | "large";
  showTagline?: boolean;
}

const sizeMap = {
  small: { container: 48, fontSize: 24, tagline: 10 },
  medium: { container: 80, fontSize: 40, tagline: 14 },
  large: { container: 120, fontSize: 60, tagline: 18 },
};

export default function LogoPlaceholder({
  size = "medium",
  showTagline = false,
}: LogoPlaceholderProps) {
  const dimensions = sizeMap[size];
  const { theme } = useTheme();

  return (
    <View className="items-center">
      {/* Logo Circle */}
      <View
        style={{
          width: dimensions.container,
          height: dimensions.container,
          borderRadius: dimensions.container / 2,
          backgroundColor: theme.logoCircleBg,
          borderWidth: 2,
          borderColor: theme.logoCircleBorder,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {/* Stylized J */}
        <Text
          style={{
            fontSize: dimensions.fontSize,
            fontWeight: "900",
            color: theme.logoText,
            letterSpacing: -1,
            fontStyle: "italic",
          }}
        >
          J
        </Text>

        {/* Accent line */}
        <View
          style={{
            position: "absolute",
            bottom: dimensions.container * 0.22,
            width: dimensions.container * 0.5,
            height: 2,
            backgroundColor: theme.logoCircleBorder,
            borderRadius: 1,
          }}
        />
      </View>

      {/* App Name */}
      {showTagline && (
        <View className="items-center mt-3">
          <Text
            style={{
              fontSize: dimensions.tagline + 4,
              fontWeight: "800",
              color: theme.text,
              letterSpacing: 1,
            }}
          >
            Justif.ai
          </Text>
          <Text
            style={{
              fontSize: dimensions.tagline - 2,
              color: theme.taglineColor,
              marginTop: 2,
              fontStyle: "italic",
            }}
          >
            {Strings.tagline}
          </Text>
        </View>
      )}
    </View>
  );
}
