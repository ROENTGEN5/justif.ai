/**
 * FloatingScrollButton Component
 * Renders a floating "Scroll to Bottom" button when the user scrolls up in a conversation.
 * Expands into a live "↓ AI is answering..." pill when the AI is actively streaming/typing
 * while the user is reading earlier messages.
 */

import React, { useEffect } from "react";
import { TouchableOpacity, Text, View, Platform } from "react-native";
import Animated, {
  FadeInDown,
  FadeOutDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "../lib/theme";

interface FloatingScrollButtonProps {
  visible: boolean;
  isTypingOrLoading?: boolean;
  onPress: () => void;
}

function FloatingScrollButton({
  visible,
  isTypingOrLoading = false,
  onPress,
}: FloatingScrollButtonProps) {
  const { theme } = useTheme();
  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    if (visible && isTypingOrLoading) {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.35, { duration: 600 }),
          withTiming(1, { duration: 600 })
        ),
        -1,
        true
      );
    } else {
      pulseOpacity.value = 1;
    }
  }, [visible, isTypingOrLoading, pulseOpacity]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  if (!visible) return null;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  };

  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      exiting={FadeOutDown.duration(180)}
      style={{
        position: "absolute",
        right: 16,
        bottom: Platform.OS === "ios" ? 104 : 92,
        zIndex: 50,
      }}
    >
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={
          isTypingOrLoading
            ? "AI is answering. Scroll to latest message"
            : "Scroll to latest message"
        }
        accessibilityHint="Scrolls the conversation to the bottom"
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
          minHeight: 40,
          paddingVertical: 6,
          paddingHorizontal: isTypingOrLoading ? 14 : 10,
          minWidth: 40,
          borderRadius: 20,
          backgroundColor: isTypingOrLoading ? theme.accent : theme.surfaceElevated,
          borderWidth: 1,
          borderColor: isTypingOrLoading ? theme.accent : theme.border,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.18,
          shadowRadius: 6,
          elevation: 5,
        }}
      >
        {isTypingOrLoading ? (
          <>
            <Animated.View
              style={[
                {
                  width: 7,
                  height: 7,
                  borderRadius: 3.5,
                  backgroundColor: theme.accentText,
                },
                dotStyle,
              ]}
            />
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: theme.accentText,
                letterSpacing: 0.2,
              }}
            >
              AI is answering...
            </Text>
            <Ionicons name="arrow-down" size={14} color={theme.accentText} />
          </>
        ) : (
          <View style={{ alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="chevron-down" size={20} color={theme.text} />
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

export default React.memo(FloatingScrollButton);
