/**
 * LoadingDots Component
 * Contextual "Thinking Stages" indicator for legal research & analysis.
 */

import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  FadeIn,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../lib/theme";

const THINKING_STAGES: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}[] = [
  {
    icon: "search-outline",
    text: "Searching Philippine Laws & R.A. database...",
  },
  {
    icon: "scale-outline",
    text: "Analyzing relevant Supreme Court decisions...",
  },
  {
    icon: "create-outline",
    text: "Drafting legal analysis...",
  },
];

interface LoadingDotsProps {
  stageText?: string;
}

export default function LoadingDots({ stageText }: LoadingDotsProps) {
  const { theme } = useTheme();
  const [stageIndex, setStageIndex] = useState(0);

  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);
  const dot3 = useSharedValue(0);

  useEffect(() => {
    const duration = 380;
    dot1.value = withRepeat(
      withSequence(withTiming(-6, { duration }), withTiming(0, { duration })),
      -1,
      false
    );
    dot2.value = withRepeat(
      withDelay(
        140,
        withSequence(withTiming(-6, { duration }), withTiming(0, { duration }))
      ),
      -1,
      false
    );
    dot3.value = withRepeat(
      withDelay(
        280,
        withSequence(withTiming(-6, { duration }), withTiming(0, { duration }))
      ),
      -1,
      false
    );
  }, [dot1, dot2, dot3]);

  useEffect(() => {
    if (stageText) return;
    const interval = setInterval(() => {
      setStageIndex((prev) => (prev + 1) % THINKING_STAGES.length);
    }, 1250);
    return () => clearInterval(interval);
  }, [stageText]);

  const animStyle1 = useAnimatedStyle(() => ({
    transform: [{ translateY: dot1.value }],
  }));
  const animStyle2 = useAnimatedStyle(() => ({
    transform: [{ translateY: dot2.value }],
  }));
  const animStyle3 = useAnimatedStyle(() => ({
    transform: [{ translateY: dot3.value }],
  }));

  const dotStyle = {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.accent,
    marginHorizontal: 2.5,
  };

  const currentStage = THINKING_STAGES[stageIndex];

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      className="items-start px-4 mb-3"
      accessible={true}
      accessibilityRole="progressbar"
      accessibilityLabel={stageText || currentStage.text}
      accessibilityLiveRegion="polite"
    >
      <View
        style={{
          backgroundColor: theme.surfaceElevated,
          borderWidth: 1,
          borderColor: theme.border,
          paddingHorizontal: 15,
          paddingVertical: 12,
          borderRadius: 18,
          borderBottomLeftRadius: 4,
          maxWidth: "85%",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 7,
            marginBottom: 8,
          }}
        >
          <Ionicons
            name={stageText ? "sparkles-outline" : currentStage.icon}
            size={14}
            color={theme.accent}
          />
          <Text
            style={{
              fontSize: 12,
              color: theme.textSecondary,
              fontWeight: "600",
              fontStyle: "italic",
            }}
          >
            {stageText || currentStage.text}
          </Text>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", height: 12 }}>
          <Animated.View style={[dotStyle, animStyle1]} />
          <Animated.View style={[dotStyle, animStyle2]} />
          <Animated.View style={[dotStyle, animStyle3]} />
        </View>
      </View>
    </Animated.View>
  );
}
