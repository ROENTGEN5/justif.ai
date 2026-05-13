/**
 * ChatBubble Component
 * Renders user and assistant messages with distinct styling.
 * Theme-aware minimalist design.
 */

import React from "react";
import { View, Text } from "react-native";
import { useTheme } from "../lib/theme";

interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

export default function ChatBubble({
  role,
  content,
  timestamp,
}: ChatBubbleProps) {
  const isUser = role === "user";
  const { theme } = useTheme();

  return (
    <View
      className={`mb-3 px-4 ${isUser ? "items-end" : "items-start"}`}
    >
      {/* Bubble */}
      <View
        style={{
          maxWidth: "82%",
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 18,
          backgroundColor: isUser
            ? theme.userBubble
            : theme.assistantBubble,
          // Tail effect via asymmetric border radius
          borderBottomRightRadius: isUser ? 4 : 18,
          borderBottomLeftRadius: isUser ? 18 : 4,
          // Shadow
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 3,
          elevation: 1,
        }}
      >
        {/* Role label for assistant */}
        {!isUser && (
          <Text
            style={{
              fontSize: 11,
              fontWeight: "700",
              color: theme.textTertiary,
              marginBottom: 4,
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            Justif.ai
          </Text>
        )}

        {/* Message content */}
        <Text
          style={{
            fontSize: 15,
            lineHeight: 22,
            color: isUser
              ? theme.userBubbleText
              : theme.assistantBubbleText,
          }}
          selectable
        >
          {content}
        </Text>
      </View>

      {/* Timestamp */}
      {timestamp && (
        <Text
          style={{
            fontSize: 10,
            color: theme.textTertiary,
            marginTop: 4,
            marginHorizontal: 4,
          }}
        >
          {new Date(timestamp).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      )}
    </View>
  );
}
