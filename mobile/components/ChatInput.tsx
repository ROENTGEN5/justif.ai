/**
 * ChatInput Component
 * Fixed bottom input bar with attachment button, text input, and send button.
 * Supports file/image attachments via camera, gallery, or document picker.
 * Theme-aware minimalist design.
 */

import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Modal,
  Platform,
  Alert,
  Keyboard,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Strings from "../constants/Strings";
import { useTheme } from "../lib/theme";
import type { FileAttachment } from "../lib/api";
import { pickImageFromCamera, pickImageFromGallery } from "../lib/mediaPicker";

interface ChatInputProps {
  onSend: (message: string) => void;
  onFileSelected: (file: FileAttachment) => void;
  onFocus?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
}

// Max file size in bytes (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed MIME types
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const ALLOWED_DOC_TYPES = ["application/pdf"];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOC_TYPES];

export default function ChatInput({
  onSend,
  onFileSelected,
  onFocus,
  isLoading = false,
  disabled = false,
}: ChatInputProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState("");
  const [attachment, setAttachment] = useState<FileAttachment | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setIsKeyboardVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleSend = () => {
    // If there's an attachment, send it
    if (attachment) {
      onFileSelected(attachment);
      setAttachment(null);
      setMessage("");
      return;
    }

    const trimmed = message.trim();
    if (!trimmed || isLoading || disabled) return;

    onSend(trimmed);
    setMessage("");
  };

  const canSend =
    (message.trim().length > 0 || attachment !== null) && !isLoading && !disabled;

  // ─── File Picking Logic ─────────────────────────────────

  const validateAndSetFile = (uri: string, name: string, mimeType: string, size?: number) => {
    if (!ALLOWED_TYPES.includes(mimeType)) {
      Alert.alert("Unsupported File", Strings.unsupportedFile);
      return;
    }

    if (size && size > MAX_FILE_SIZE) {
      Alert.alert("File Too Large", Strings.fileTooLarge);
      return;
    }

    setAttachment({ uri, name, mimeType, size });
  };

  const handleTakePhoto = async () => {
    try {
      const normalized = await pickImageFromCamera({
        maxDimension: 1024,
        quality: 0.8,
      });

      if (!normalized) {
        return;
      }

      validateAndSetFile(
        normalized.uri,
        normalized.name,
        normalized.mimeType,
        normalized.size,
      );
    } catch (error: any) {
      console.warn("Error taking photo:", error);
      Alert.alert("Camera Error", error?.message || "Could not capture photo.");
    }
  };

  const handleChooseFromGallery = async () => {
    try {
      const normalized = await pickImageFromGallery({
        allowsEditing: false,
        maxDimension: 1024,
        quality: 0.8,
      });

      if (!normalized) {
        return;
      }

      validateAndSetFile(
        normalized.uri,
        normalized.name,
        normalized.mimeType,
        normalized.size,
      );
    } catch (error: any) {
      console.warn("Error choosing image from gallery:", error);
      Alert.alert("Gallery Error", error?.message || "Could not select image from gallery.");
    }
  };

  const handleChooseDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        validateAndSetFile(
          asset.uri,
          asset.name,
          asset.mimeType || "application/pdf",
          asset.size,
        );
      }
    } catch {
      Alert.alert("Error", Strings.fileUploadError);
    }
  };

  const showAttachmentOptions = () => {
    Keyboard.dismiss();
    setShowAttachMenu(true);
  };

  const closeAttachMenu = () => {
    setShowAttachMenu(false);
  };

  const handleAttachOption = (option: "camera" | "gallery" | "document") => {
    setShowAttachMenu(false);
    // Allow modal dismissal to complete before launching native activity
    setTimeout(() => {
      if (option === "camera") {
        void handleTakePhoto();
      } else if (option === "gallery") {
        void handleChooseFromGallery();
      } else if (option === "document") {
        void handleChooseDocument();
      }
    }, 250);
  };

  const removeAttachment = () => {
    setAttachment(null);
  };

  // ─── Helpers ────────────────────────────────────────────

  const getFileIcon = (mimeType: string): keyof typeof Ionicons.glyphMap => {
    if (mimeType === "application/pdf") return "document-text";
    if (mimeType.startsWith("image/")) return "image";
    return "document";
  };

  const truncateFilename = (name: string, maxLen: number = 28) => {
    if (name.length <= maxLen) return name;
    const ext = name.lastIndexOf(".");
    if (ext > 0) {
      const extension = name.slice(ext);
      const base = name.slice(0, maxLen - extension.length - 3);
      return `${base}...${extension}`;
    }
    return name.slice(0, maxLen - 3) + "...";
  };

  const bottomSafePadding = isKeyboardVisible
    ? 6
    : Math.max(insets.bottom, Platform.OS === "ios" ? 20 : 10);

  return (
    <View style={{ backgroundColor: theme.background }}>
      {/* ─── Attachment Preview ──────────────────────────── */}
      {attachment && (
        <View
          style={{
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: 4,
            backgroundColor: theme.background,
            borderTopWidth: 1,
            borderTopColor: theme.border,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: theme.surfaceElevated,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderWidth: 1,
              borderColor: theme.accent + "30",
              gap: 8,
            }}
          >
            <Ionicons
              name={getFileIcon(attachment.mimeType)}
              size={20}
              color={theme.accent}
            />
            <Text
              style={{
                flex: 1,
                fontSize: 13,
                color: theme.text,
                fontWeight: "500",
              }}
              numberOfLines={1}
            >
              {truncateFilename(attachment.name)}
            </Text>
            {attachment.size && (
              <Text
                style={{
                  fontSize: 11,
                  color: theme.textTertiary,
                }}
              >
                {(attachment.size / 1024 / 1024).toFixed(1)}MB
              </Text>
            )}
            <TouchableOpacity
              onPress={removeAttachment}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: theme.textTertiary + "20",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name="close" size={14} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ─── Input Bar ──────────────────────────────────── */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          paddingHorizontal: 12,
          paddingVertical: 8,
          backgroundColor: theme.background,
          borderTopWidth: attachment ? 0 : 1,
          borderTopColor: theme.border,
          gap: 8,
        }}
      >
        {/* Attachment Button */}
        <TouchableOpacity
          onPress={showAttachmentOptions}
          disabled={isLoading || disabled}
          activeOpacity={0.7}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Ionicons
            name="attach"
            size={24}
            color={
              isLoading || disabled
                ? theme.textTertiary
                : theme.textSecondary
            }
            style={{ transform: [{ rotate: "45deg" }] }}
          />
        </TouchableOpacity>

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
            onFocus={onFocus}
            placeholder={
              attachment
                ? "Add a message (optional)..."
                : Strings.chatPlaceholder
            }
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
              name={attachment ? "document-text" : "send"}
              size={20}
              color={canSend ? theme.accentText : theme.textTertiary}
              style={attachment ? undefined : { marginLeft: 2 }}
            />
          )}
        </TouchableOpacity>
      </View>

      {/* ─── Disclaimer Text ────────────────────────────── */}
      <View
        style={{
          backgroundColor: theme.background,
          paddingBottom: bottomSafePadding,
          paddingHorizontal: 16,
          paddingTop: 2,
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontSize: 10,
            color: theme.textTertiary,
            textAlign: "center",
            lineHeight: 14,
          }}
        >
          Justif.ai is an AI and can make mistakes. Legal terms here are for educational purposes only.
        </Text>
      </View>

      {/* ─── Custom Attach Menu Modal ──────────────────────── */}
      <Modal
        visible={showAttachMenu}
        transparent
        animationType="fade"
        onRequestClose={closeAttachMenu}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable
            onPress={closeAttachMenu}
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(0,0,0,0.5)" },
            ]}
          />
          <View
            style={{
              backgroundColor: theme.surfaceElevated,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: Math.max(insets.bottom + 16, Platform.OS === "ios" ? 40 : 24),
            }}
          >
            <View
              style={{
                width: 40,
                height: 4,
                backgroundColor: theme.border,
                borderRadius: 2,
                alignSelf: "center",
                marginBottom: 24,
              }}
            />

            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                color: theme.text,
                marginBottom: 20,
              }}
            >
              {Strings.attachFile}
            </Text>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <TouchableOpacity
                onPress={() => handleAttachOption("camera")}
                activeOpacity={0.7}
                style={{ alignItems: "center", flex: 1 }}
              >
                <View
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: 30,
                    backgroundColor: theme.accent + "20",
                    justifyContent: "center",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <Ionicons name="camera" size={28} color={theme.accent} />
                </View>
                <Text
                  style={{
                    fontSize: 13,
                    color: theme.textSecondary,
                    fontWeight: "500",
                  }}
                >
                  Camera
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleAttachOption("gallery")}
                activeOpacity={0.7}
                style={{ alignItems: "center", flex: 1 }}
              >
                <View
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: 30,
                    backgroundColor: theme.accent + "20",
                    justifyContent: "center",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <Ionicons name="images" size={28} color={theme.accent} />
                </View>
                <Text
                  style={{
                    fontSize: 13,
                    color: theme.textSecondary,
                    fontWeight: "500",
                  }}
                >
                  Gallery
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleAttachOption("document")}
                activeOpacity={0.7}
                style={{ alignItems: "center", flex: 1 }}
              >
                <View
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: 30,
                    backgroundColor: theme.accent + "20",
                    justifyContent: "center",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <Ionicons name="document-text" size={28} color={theme.accent} />
                </View>
                <Text
                  style={{
                    fontSize: 13,
                    color: theme.textSecondary,
                    fontWeight: "500",
                  }}
                >
                  Document
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
