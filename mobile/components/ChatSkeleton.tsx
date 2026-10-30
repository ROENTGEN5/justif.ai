/**
 * ChatSkeleton Component
 * Lightweight UI-thread pulsing skeleton loader for chat conversations.
 * Replaces bare full-screen spinners to make perceived loading faster.
 */

import React, { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "../lib/theme";

function ChatSkeleton() {
  const { theme } = useTheme();
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.75, { duration: 700 }),
        withTiming(0.35, { duration: 700 })
      ),
      -1,
      false
    );
  }, [opacity]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 20, gap: 18 }}>
      {/* Mock User Bubble (Right-aligned) */}
      <Animated.View style={[pulseStyle, { alignItems: "flex-end" }]}>
        <View
          style={{
            width: "62%",
            backgroundColor: theme.surfaceElevated,
            borderRadius: 18,
            borderBottomRightRadius: 4,
            padding: 14,
            gap: 8,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <View
            style={{
              height: 11,
              width: "90%",
              backgroundColor: theme.border,
              borderRadius: 6,
            }}
          />
          <View
            style={{
              height: 11,
              width: "55%",
              backgroundColor: theme.border,
              borderRadius: 6,
            }}
          />
        </View>
      </Animated.View>

      {/* Mock Assistant Bubble 1 (Left-aligned) */}
      <Animated.View style={[pulseStyle, { alignItems: "flex-start" }]}>
        <View
          style={{
            width: "82%",
            backgroundColor: theme.assistantBubble,
            borderRadius: 18,
            borderBottomLeftRadius: 4,
            padding: 16,
            gap: 10,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <View
            style={{
              height: 9,
              width: 64,
              backgroundColor: theme.border,
              borderRadius: 4,
              marginBottom: 2,
            }}
          />
          <View
            style={{
              height: 11,
              width: "96%",
              backgroundColor: theme.border,
              borderRadius: 6,
            }}
          />
          <View
            style={{
              height: 11,
              width: "88%",
              backgroundColor: theme.border,
              borderRadius: 6,
            }}
          />
          <View
            style={{
              height: 11,
              width: "74%",
              backgroundColor: theme.border,
              borderRadius: 6,
            }}
          />
          <View
            style={{
              height: 11,
              width: "45%",
              backgroundColor: theme.border,
              borderRadius: 6,
            }}
          />
        </View>
      </Animated.View>

      {/* Mock User Bubble 2 (Right-aligned) */}
      <Animated.View style={[pulseStyle, { alignItems: "flex-end" }]}>
        <View
          style={{
            width: "48%",
            backgroundColor: theme.surfaceElevated,
            borderRadius: 18,
            borderBottomRightRadius: 4,
            padding: 14,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <View
            style={{
              height: 11,
              width: "85%",
              backgroundColor: theme.border,
              borderRadius: 6,
            }}
          />
        </View>
      </Animated.View>

      {/* Mock Assistant Bubble 2 (Left-aligned) */}
      <Animated.View style={[pulseStyle, { alignItems: "flex-start" }]}>
        <View
          style={{
            width: "76%",
            backgroundColor: theme.assistantBubble,
            borderRadius: 18,
            borderBottomLeftRadius: 4,
            padding: 16,
            gap: 10,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <View
            style={{
              height: 9,
              width: 64,
              backgroundColor: theme.border,
              borderRadius: 4,
              marginBottom: 2,
            }}
          />
          <View
            style={{
              height: 11,
              width: "92%",
              backgroundColor: theme.border,
              borderRadius: 6,
            }}
          />
          <View
            style={{
              height: 11,
              width: "68%",
              backgroundColor: theme.border,
              borderRadius: 6,
            }}
          />
        </View>
      </Animated.View>
    </View>
  );
}

export default React.memo(ChatSkeleton);
