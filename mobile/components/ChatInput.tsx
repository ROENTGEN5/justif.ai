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
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import * as DocumentPicker from "expo-document-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Strings } from "../constants/Strings";
import { useTheme } from "../lib/theme";
import { textFix } from "../lib/textFix";
import type { FileAttachment } from "../lib/api";
import { pickImageFromCamera, pickImageFromGallery } from "../lib/mediaPicker";

interface ChatInputProps {
  onSend: (message: string) => void;
  onFileSelected: (file: FileAttachment, userPrompt?: string) => void;
  onFocus?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  /** Optional text prefilled when user selects "Ask Follow-up" from a message bubble */
  prefillText?: string;
  onClearPrefill?: () => void;
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
  prefillText,
  onClearPrefill,
}: ChatInputProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState("");
  const [attachment, setAttachment] = useState<FileAttachment | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    if (!prefillText) return;
    const timer = setTimeout(() => {
      setMessage(prefillText);
      onClearPrefill?.();
      inputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [prefillText, onClearPrefill]);

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
    const trimmed = message.trim();

    // If there's an attachment, send it along with optional user prompt
    if (attachment) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onFileSelected(attachment, trimmed || undefined);
      setAttachment(null);
      setMessage("");
      return;
    }

    if (!trimmed || isLoading || disabled) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Keyboard.dismiss();
    setShowAttachMenu(true);
  };

  const closeAttachMenu = () => {
    setShowAttachMenu(false);
  };

  const handleAttachOption = (option: "camera" | "gallery" | "document") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setAttachment(null);
  };

  // ─── Helpers ────────────────────────────────────────────

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024 * 1024) {
      return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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
      {/* ─── Pre-Send Attachment Preview Card ─────────────── */}
      {attachment && (
        <View
          style={{
            paddingHorizontal: 12,
            paddingTop: 10,
            paddingBottom: 6,
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
              borderRadius: 14,
              padding: 10,
              borderWidth: 1,
              borderColor: theme.border,
              gap: 12,
            }}
          >
            {attachment.mimeType.startsWith("image/") ? (
              <Image
                source={{ uri: attachment.uri }}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 8,
                  backgroundColor: theme.border,
                }}
                contentFit="cover"
              />
            ) : (
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 8,
                  backgroundColor: theme.accent + "18",
                  borderWidth: 1,
                  borderColor: theme.accent + "35",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons name="document-text" size={20} color={theme.accent} />
                <Text
                  style={{
                    fontSize: 8,
                    fontWeight: "800",
                    color: theme.accent,
                    marginTop: 1,
                  }}
                >
                  PDF
                </Text>
              </View>
            )}

            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 13,
                  color: theme.text,
                  fontWeight: "600",
                }}
                numberOfLines={1}
              >
                {truncateFilename(attachment.name, 32)}
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: theme.textTertiary,
                  marginTop: 2,
                }}
              >
                {attachment.mimeType === "application/pdf"
                  ? "PDF Legal Document"
                  : "Document Photo"}
                {attachment.size ? ` • ${formatFileSize(attachment.size)}` : ""}
              </Text>
            </View>

            <TouchableOpacity
              onPress={removeAttachment}
              accessibilityRole="button"
              accessibilityLabel={`Remove attached file ${attachment.name}`}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: theme.border,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name="close" size={15} color={theme.textSecondary} />
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
          accessibilityRole="button"
          accessibilityLabel="Attach document or photo"
          accessibilityHint="Opens menu to take a photo, choose from gallery, or upload a PDF"
          accessibilityState={{ disabled: isLoading || disabled }}
          style={{
            minWidth: 44,
            minHeight: 44,
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
            maxHeight: 140,
          }}
        >
          <TextInput
            ref={inputRef}
            value={message}
            onChangeText={setMessage}
            onFocus={onFocus}
            accessibilityLabel="Legal question input"
            accessibilityHint="Type your Philippine legal question here"
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
              maxHeight: 120,
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
          accessibilityRole="button"
          accessibilityLabel={
            isLoading
              ? "Sending request, please wait"
              : attachment
                ? "Send attached document for legal analysis"
                : "Send legal question"
          }
          accessibilityHint="Submits your question to Justif.ai"
          accessibilityState={{ disabled: !canSend, busy: isLoading }}
          style={{
            minWidth: 44,
            minHeight: 44,
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

      {/* ─── Legal Disclaimer Banner ────────────────────── */}
      <View
        style={{
          backgroundColor: theme.background,
          paddingBottom: bottomSafePadding,
          paddingHorizontal: 16,
          paddingTop: 3,
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          gap: 5,
        }}
      >
        <Ionicons name="scale-outline" size={11} color={theme.textTertiary} />
        <Text
          {...textFix}
          style={{
            flexShrink: 1,
            fontSize: 10,
            color: theme.textTertiary,
            textAlign: "center",
            lineHeight: 14,
          }}
        >
          Justif.ai provides Philippine legal information for research purposes, not formal attorney-client advice.
        </Text>
      </View>

      {/* ─── Slide-Up Attachment Bottom Sheet ───────────── */}
      <Modal
        visible={showAttachMenu}
        transparent
        animationType="slide"
        onRequestClose={closeAttachMenu}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable
            onPress={closeAttachMenu}
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(0,0,0,0.45)" },
            ]}
          />
          <View
            style={{
              backgroundColor: theme.surfaceElevated,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderTopWidth: 1,
              borderTopColor: theme.border,
              paddingHorizontal: 20,
              paddingTop: 14,
              paddingBottom: Math.max(insets.bottom + 16, Platform.OS === "ios" ? 36 : 24),
            }}
          >
            {/* Drag Handle Bar */}
            <View
              style={{
                width: 40,
                height: 4,
                backgroundColor: theme.border,
                borderRadius: 2,
                alignSelf: "center",
                marginBottom: 18,
              }}
            />

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <View>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "700",
                    color: theme.text,
                  }}
                >
                  {Strings.attachFile}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.textTertiary,
                    marginTop: 2,
                  }}
                >
                  Analyze contracts, notices, or legal documents
                </Text>
              </View>
              <TouchableOpacity
                onPress={closeAttachMenu}
                accessibilityRole="button"
                accessibilityLabel="Close attachment menu"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: theme.border,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons name="close" size={16} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 10 }}>
              {/* Option 1: Take Photo */}
              <TouchableOpacity
                onPress={() => handleAttachOption("camera")}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Take Photo: Scan or photograph a legal document"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: theme.cardBg,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 14,
                  padding: 12,
                  gap: 14,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: theme.accent + "18",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Ionicons name="camera-outline" size={22} color={theme.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "600",
                      color: theme.text,
                    }}
                  >
                    Take Photo
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: theme.textSecondary,
                      marginTop: 2,
                    }}
                  >
                    Scan or photograph a legal document
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
              </TouchableOpacity>

              {/* Option 2: Photo Library */}
              <TouchableOpacity
                onPress={() => handleAttachOption("gallery")}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Photo Library: Choose from saved images or screenshots"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: theme.cardBg,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 14,
                  padding: 12,
                  gap: 14,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: theme.accent + "18",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Ionicons name="images-outline" size={22} color={theme.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "600",
                      color: theme.text,
                    }}
                  >
                    Photo Library
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: theme.textSecondary,
                      marginTop: 2,
                    }}
                  >
                    Choose from saved images or screenshots
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
              </TouchableOpacity>

              {/* Option 3: Upload PDF */}
              <TouchableOpacity
                onPress={() => handleAttachOption("document")}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Upload PDF: Attach contract, summons, or legal agreement"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: theme.cardBg,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 14,
                  padding: 12,
                  gap: 14,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: theme.accent + "18",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Ionicons name="document-text-outline" size={22} color={theme.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "600",
                      color: theme.text,
                    }}
                  >
                    Upload PDF
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: theme.textSecondary,
                      marginTop: 2,
                    }}
                  >
                    Attach contract, summons, or legal agreement
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
