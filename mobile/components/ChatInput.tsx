/**
 * ChatInput Component
 * Fixed bottom input bar with send button.
 * Theme-aware minimalist design.
 */

import React, { useState, useRef } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Strings from "../constants/Strings";
import { useTheme } from "../lib/theme";

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export default function ChatInput({
  onSend,
  isLoading = false,
  disabled = false,
}: ChatInputProps) {
  const { theme } = useTheme();
  const [message, setMessage] = useState("");
  const inputRef = useRef<TextInput>(null);

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed || isLoading || disabled) return;

    onSend(trimmed);
    setMessage("");
  };

  const canSend = message.trim().length > 0 && !isLoading && !disabled;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          paddingHorizontal: 12,
          paddingVertical: 8,
          paddingBottom: Platform.OS === "ios" ? 28 : 12,
          backgroundColor: theme.background,
          borderTopWidth: 1,
          borderTopColor: theme.border,
          gap: 8,
        }}
      >
        {/* Text Input */}
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "flex-end",
            backgroundColor: theme.inputBg,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: theme.inputBorder,
            paddingHorizontal: 16,
            paddingVertical: Platform.OS === "ios" ? 10 : 4,
            minHeight: 44,
            maxHeight: 120,
          }}
        >
          <TextInput
            ref={inputRef}
            value={message}
            onChangeText={setMessage}
            placeholder={Strings.chatPlaceholder}
            placeholderTextColor={theme.inputPlaceholder}
            multiline
            maxLength={5000}
            style={{
              flex: 1,
              fontSize: 15,
              lineHeight: 20,
              color: theme.inputText,
              maxHeight: 100,
              paddingTop: Platform.OS === "ios" ? 0 : 8,
            }}
            editable={!disabled}
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
        </View>

        {/* Send Button */}
        <TouchableOpacity
          onPress={handleSend}
          disabled={!canSend}
          activeOpacity={0.7}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: canSend ? theme.sendButton : theme.sendButtonDisabled,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={theme.accentText} />
          ) : (
            <Ionicons
              name="send"
              size={20}
              color={canSend ? theme.accentText : theme.textTertiary}
              style={{ marginLeft: 2 }}
            />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
