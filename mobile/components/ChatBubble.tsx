/**
 * ChatBubble Component
 * Renders user and assistant messages with distinct styling.
 * Theme-aware minimalist design.
 */

import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import Animated, { FadeInDown, FadeInUp, Layout } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import Markdown from "react-native-markdown-display";
import { useTheme } from "../lib/theme";

const parseActionCards = (text: string) => {
  // Regex to match lines like `* **[Key]**: [Value]` or `  + **[Key]**: [Value]`
  const pattern = /^\s*(?:\*|-|\+)\s+\*\*([^*]+)\*\*:\s+(.+)$/gm;
  
  let lastIndex = 0;
  let match;
  const components = [];
  
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      components.push({ type: 'markdown', content: text.substring(lastIndex, match.index) });
    }
    components.push({ type: 'card', key: match[1], value: match[2] });
    lastIndex = pattern.lastIndex;
  }
  
  if (lastIndex < text.length) {
    components.push({ type: 'markdown', content: text.substring(lastIndex) });
  }
  
  return components;
};

interface ChatBubbleProps {
  id?: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  rating?: "like" | "unlike";
  onRate?: (id: string, rating: "like" | "unlike") => void;
}

export default function ChatBubble({
  id,
  role,
  content,
  timestamp,
  rating,
  onRate,
}: ChatBubbleProps) {
  const isUser = role === "user";
  const { theme, mode } = useTheme();

  const [showRating, setShowRating] = useState(false);

  useEffect(() => {
    // If it's a user message or already rated, don't show the timer
    if (isUser || rating) return;

    const timeSinceCreated = timestamp ? Date.now() - new Date(timestamp).getTime() : 0;
    const timeToWait = 30000 - timeSinceCreated;

    if (timeToWait <= 0) {
      setShowRating(true);
    } else {
      const timer = setTimeout(() => {
        setShowRating(true);
      }, timeToWait);
      return () => clearTimeout(timer);
    }
  }, [isUser, rating, timestamp]);

  return (
    <Animated.View
      entering={isUser ? FadeInUp.duration(300) : FadeInDown.duration(300)}
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
        {isUser ? (
          <Text
            style={{
              fontSize: 15,
              lineHeight: 22,
              color: theme.userBubbleText,
            }}
            selectable
          >
            {content}
          </Text>
        ) : (
          <View style={{ gap: 8 }}>
            {parseActionCards(content).map((chunk, index) => {
              if (chunk.type === 'markdown') {
                return (
                  <Markdown
                    key={index}
                    style={{
                      body: {
                        fontSize: 15,
                        lineHeight: 22,
                        color: theme.assistantBubbleText,
                      },
                      strong: {
                        fontWeight: 'bold',
                        color: theme.assistantBubbleText,
                      },
                      em: {
                        fontStyle: 'italic',
                        color: theme.assistantBubbleText,
                      },
                      paragraph: {
                        marginTop: 0,
                        marginBottom: 10,
                      },
                      list_item: {
                        marginTop: 4,
                        marginBottom: 4,
                      },
                      code_block: {
                        backgroundColor: theme.surfaceHover || 'rgba(0,0,0,0.05)',
                        color: theme.assistantBubbleText,
                        padding: 8,
                        borderRadius: 8,
                        marginTop: 4,
                        marginBottom: 4,
                      },
                      code_inline: {
                        backgroundColor: theme.surfaceHover || 'rgba(0,0,0,0.05)',
                        color: theme.assistantBubbleText,
                      },
                    }}
                  >
                    {chunk.content}
                  </Markdown>
                );
              } else {
                return (
                  <View
                    key={index}
                    style={{
                      backgroundColor: theme.surfaceElevated,
                      borderRadius: 12,
                      padding: 12,
                      borderLeftWidth: 4,
                      borderLeftColor: theme.accent,
                      marginVertical: 4,
                    }}
                  >
                    <Text style={{ fontWeight: "700", color: theme.accent, fontSize: 14, marginBottom: 4 }}>
                      {chunk.key}
                    </Text>
                    <Text style={{ color: theme.assistantBubbleText, fontSize: 14, lineHeight: 20 }}>
                      {chunk.value}
                    </Text>
                  </View>
                );
              }
            })}
          </View>
        )}
      </View>

      {/* Timestamp and Rating Actions */}
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, marginHorizontal: 4, gap: 12 }}>
        {timestamp && (
          <Text
            style={{
              fontSize: 10,
              color: theme.textTertiary,
            }}
          >
            {new Date(timestamp).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        )}

        {!isUser && id && onRate && !rating && showRating && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginLeft: "auto" }}>
            <TouchableOpacity 
              onPress={() => onRate(id, "like")}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons 
                name={rating === "like" ? "thumbs-up" : "thumbs-up-outline"} 
                size={14} 
                color={rating === "like" ? theme.accent : theme.textTertiary} 
              />
            </TouchableOpacity>
            
            <TouchableOpacity 
              onPress={() => onRate(id, "unlike")}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons 
                name={rating === "unlike" ? "thumbs-down" : "thumbs-down-outline"} 
                size={14} 
                color={rating === "unlike" ? theme.accent : theme.textTertiary} 
              />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Animated.View>
  );
}
