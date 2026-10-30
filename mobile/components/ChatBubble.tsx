/**
 * ChatBubble Component
 * Renders user and assistant messages with distinct styling,
 * structured sections (Short Explanation, Relevant Sources, Practical Next Steps),
 * progressive typewriter animation with blinking cursor (▊),
 * tap-to-skip, statutory blockquote styling, Text-to-Speech (expo-speech),
 * long-press contextual action sheet, one-tap copy/share utilities, and tactile haptic feedback.
 */

import React, { useState, useEffect, useMemo, useDeferredValue, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Share,
  Platform,
  Modal,
  StyleSheet,
  Alert,
} from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Markdown, { RenderRules } from "react-native-markdown-display";
import { reportCitation, LawSource } from "../lib/api";
import { compactCitations, findCitation, splitCitations } from "../lib/citations";
import { useTheme } from "../lib/theme";
import { singleLine } from "../lib/textFix";
import { useTypewriter } from "../hooks/useTypewriter";

const APP_DOWNLOAD_URL =
  process.env.EXPO_PUBLIC_APP_DOWNLOAD_URL ||
  "https://expo.dev/accounts/roentgen/projects/justifai/builds/36b74898-0f9c-41f6-9b45-52155419508b";

const parseActionCards = (text: string) => {
  // Regex to match lines like `* **[Key]**: [Value]` or `  + **[Key]**: [Value]`
  const pattern = /^\s*(?:\*|-|\+)\s+\*\*([^*]+)\*\*:\s+(.+)$/gm;

  let lastIndex = 0;
  let match;
  const components = [];

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      components.push({ type: "markdown" as const, content: text.substring(lastIndex, match.index) });
    }
    components.push({ type: "card" as const, key: match[1], value: match[2] });
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    components.push({ type: "markdown" as const, content: text.substring(lastIndex) });
  }

  return components;
};

/**
 * Splits a substantive assistant answer into Explanation body and extracted Practical Next Steps
 * if the response includes a Next Steps heading or bulleted action items.
 */
function extractStructuredSections(text: string) {
  const nextStepsPattern =
    /(?:^|\n)(?:#{1,4}\s*|\*\*)\s*(?:\d+\.\s*)?(?:Practical Next Steps|Next Steps|Mga Praktikal na Hakbang|Mga Hakbang na Maaaring Gawin|Ano ang Dapat Gawin)\s*(?:\*\*)?:?\s*\n([\s\S]+)$/i;
  const match = nextStepsPattern.exec(text);
  if (!match) {
    return { explanationText: text, nextStepsText: null };
  }
  const explanationText = text.slice(0, match.index).trim();
  const nextStepsText = match[1].trim();
  return {
    explanationText: explanationText || text,
    nextStepsText: nextStepsText || null,
  };
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    if (Clipboard && typeof Clipboard.setStringAsync === "function") {
      await Clipboard.setStringAsync(text);
      return true;
    }
  } catch {
    // Fallback if native module is not linked in an older dev-client build
  }
  return false;
}

function stripMarkdownForSpeech(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function speakResponseAloud(text: string, onDone: () => void): boolean {
  const clean = stripMarkdownForSpeech(text);
  if (!clean) return false;

  try {
    if (
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      "speechSynthesis" in window
    ) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = "en-PH";
      utterance.rate = 0.98;
      utterance.onend = onDone;
      utterance.onerror = onDone;
      window.speechSynthesis.speak(utterance);
      return true;
    }

    if (Speech && typeof Speech.speak === "function") {
      Speech.stop();
      Speech.speak(clean, {
        language: "en-US",
        rate: 0.98,
        onDone,
        onStopped: onDone,
        onError: onDone,
      });
      return true;
    }
  } catch {
    // Native module not linked in older dev client
  }
  return false;
}

function stopSpeechAloud(): void {
  try {
    if (
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      "speechSynthesis" in window
    ) {
      window.speechSynthesis.cancel();
      return;
    }
    if (Speech && typeof Speech.stop === "function") {
      Speech.stop();
    }
  } catch {
    // Ignore if unavailable
  }
}

export interface ChatBubbleProps {
  id?: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  sources?: LawSource[];
  rating?: "like" | "unlike";
  onRate?: (id: string, rating: "like" | "unlike") => void;
  /** Callback to populate ChatInput with a follow-up quote */
  onAskFollowUp?: (snippet: string) => void;
  onCitationPress?: (number: number) => void;
  /** Whether to progressively type out this message word-by-word */
  animateTyping?: boolean;
  /** Whether tokens are still actively streaming from the server */
  isStreaming?: boolean;
  /** Throttled callback while typing to auto-scroll the conversation */
  onTypingTick?: () => void;
  /** Callback fired once progressive typing completes */
  onTypingComplete?: (id?: string) => void;
}

function ChatBubble({
  id,
  role,
  content,
  timestamp,
  sources,
  rating,
  onRate,
  onAskFollowUp,
  onCitationPress,
  animateTyping = false,
  isStreaming = false,
  onTypingTick,
  onTypingComplete,
}: ChatBubbleProps) {
  const isUser = role === "user";
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [showRating, setShowRating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showActionSheet, setShowActionSheet] = useState(false);

  const { displayedText, isTyping, completeImmediately } = useTypewriter(content, {
    enabled: !isUser && Boolean(animateTyping),
    wordsPerTick: 3,
    intervalMs: 32,
    onTick: onTypingTick,
    onComplete: () => onTypingComplete?.(id),
  });

  const activeTyping = !isUser && (isTyping || isStreaming);
  const deferredContent = useDeferredValue(content);

  const renderCitationText = useCallback((text: string, key: string) =>
    splitCitations(text).map((part, index) => {
      const number = part.number;
      if (number === undefined) return part.text;
      const source = findCitation(sources || [], number);
      const canOpen = Boolean(source && onCitationPress);
      return (
        <Text
          key={`${key}-citation-${index}`}
          accessibilityRole={canOpen ? "button" : "text"}
          accessibilityLabel={source
            ? `Legal source ${number}: ${source.short_title || source.full_title || "Philippine law"}`
            : `Legal source ${number}, saved details unavailable`}
          accessibilityHint={canOpen ? "Opens the law, supporting excerpt, and official link" : undefined}
          onPress={canOpen ? (event) => {
            event.stopPropagation();
            onCitationPress?.(number);
          } : undefined}
          style={{
            fontSize: 13,
            fontWeight: "800",
            color: canOpen ? theme.accent : theme.textSecondary,
            backgroundColor: theme.surfaceElevated,
            borderRadius: 5,
            lineHeight: 22,
          }}
        >
          {`\u00a0[${number}]\u00a0`}
        </Text>
      );
    }), [sources, onCitationPress, theme]);

  const citationRules = useMemo<RenderRules>(() => ({
    text: (node, _children, parents, styles, inheritedStyles = {}) => (
      <Text key={node.key} style={[inheritedStyles, styles.text]}>
        {parents.some(parent => parent.type === "link")
          ? node.content
          : renderCitationText(node.content, node.key)}
      </Text>
    ),
  }), [renderCitationText]);

  // Stop speech on unmount
  useEffect(() => {
    return () => {
      if (isSpeaking) {
        stopSpeechAloud();
      }
    };
  }, [isSpeaking]);

  const { explanationText, nextStepsText } = useMemo(
    () =>
      isUser || activeTyping
        ? { explanationText: deferredContent, nextStepsText: null }
        : extractStructuredSections(deferredContent),
    [isUser, activeTyping, deferredContent]
  );

  const parsedComponents = useMemo(
    () => (isUser || activeTyping ? [] : parseActionCards(explanationText)),
    [isUser, activeTyping, explanationText]
  );

  const hasSubstantiveStructure = useMemo(
    () =>
      !isUser &&
      !activeTyping &&
      ((sources && sources.length > 0) ||
        /\[Source\s+\d+\]/i.test(deferredContent) ||
        Boolean(nextStepsText)),
    [isUser, activeTyping, sources, deferredContent, nextStepsText]
  );

  const markdownStyle = useMemo(
    () => ({
      body: {
        fontSize: 15,
        lineHeight: 22,
        color: theme.assistantBubbleText,
      },
      heading1: {
        fontSize: 18,
        fontWeight: "800" as const,
        color: theme.assistantBubbleText,
        marginTop: 8,
        marginBottom: 6,
      },
      heading2: {
        fontSize: 16,
        fontWeight: "700" as const,
        color: theme.assistantBubbleText,
        marginTop: 6,
        marginBottom: 4,
      },
      heading3: {
        fontSize: 15,
        fontWeight: "700" as const,
        color: theme.assistantBubbleText,
        marginTop: 4,
        marginBottom: 4,
      },
      strong: {
        fontWeight: "bold" as const,
        color: theme.assistantBubbleText,
      },
      em: {
        fontStyle: "italic" as const,
        color: theme.assistantBubbleText,
      },
      paragraph: {
        marginTop: 0,
        marginBottom: 10,
      },
      blockquote: {
        backgroundColor: theme.surfaceElevated,
        borderLeftWidth: 3,
        borderLeftColor: theme.accent,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        marginVertical: 6,
      },
      hr: {
        backgroundColor: theme.divider,
        height: 1,
        marginVertical: 10,
      },
      list_item: {
        marginTop: 4,
        marginBottom: 4,
      },
      code_block: {
        backgroundColor: theme.surfaceElevated || "rgba(0,0,0,0.05)",
        color: theme.assistantBubbleText,
        padding: 10,
        borderRadius: 8,
        marginTop: 4,
        marginBottom: 4,
      },
      code_inline: {
        backgroundColor: theme.surfaceElevated || "rgba(0,0,0,0.05)",
        color: theme.accent,
        fontWeight: "600" as const,
        paddingHorizontal: 5,
        paddingVertical: 2,
        borderRadius: 4,
      },
    }),
    [theme]
  );

  useEffect(() => {
    // If it's a user message or already rated, don't show the timer
    if (isUser || rating) return;

    const timeSinceCreated = timestamp ? Date.now() - new Date(timestamp).getTime() : 0;
    const timeToWait = 30000 - timeSinceCreated;

    if (timeToWait <= 0) {
      const timer = setTimeout(() => setShowRating(true), 0);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => {
        setShowRating(true);
      }, timeToWait);
      return () => clearTimeout(timer);
    }
  }, [isUser, rating, timestamp]);

  const handleCopy = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const ok = await copyTextToClipboard(content);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      Share.share({ message: content }).catch(() => {});
    }
  };

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await Share.share({
        message: `${content}\n\n— Shared via the Justif AI app\nDownload for Android: ${APP_DOWNLOAD_URL}`,
      });
    } catch {
      // Ignore share cancellation
    }
  };

  const handleToggleSpeech = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (isSpeaking) {
      stopSpeechAloud();
      setIsSpeaking(false);
      return;
    }

    const started = speakResponseAloud(content, () => {
      setIsSpeaking(false);
    });

    if (started) {
      setIsSpeaking(true);
    } else {
      Alert.alert(
        "Read Aloud Unavailable",
        "Text-to-speech requires a rebuilt development client on this device."
      );
    }
  };

  const handleLongPressBubble = () => {
    if (activeTyping) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setShowActionSheet(true);
  };

  const handleAskFollowUpAction = () => {
    setShowActionSheet(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const cleanSnippet = stripMarkdownForSpeech(content).slice(0, 75);
    const formattedQuote =
      cleanSnippet.length < stripMarkdownForSpeech(content).length
        ? `${cleanSnippet}...`
        : cleanSnippet;
    onAskFollowUp?.(formattedQuote);
  };

  const [reportBusy, setReportBusy] = useState(false);
  const handleReportInaccurateCitation = () => {
    if (reportBusy) return;
    setShowActionSheet(false);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      Alert.alert("Answer not saved", "Recover this request before reporting its citation.");
      return;
    }
    const submit = async (reason: string) => {
      setReportBusy(true);
      try {
        await reportCitation(id, reason);
        Alert.alert("Report saved", "Your reason, answer, and cited sources were saved for review.");
      } catch (error) {
        Alert.alert("Report not saved", error instanceof Error ? error.message : "Please try again.");
      } finally {
        setReportBusy(false);
      }
    };
    Alert.alert("Report citation", "Choose the reason that best describes the problem.", [
      { text: "Source does not support answer", onPress: () => void submit("Source does not support answer") },
      { text: "Source is incorrect or outdated", onPress: () => void submit("Source is incorrect or outdated") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleRatePress = (targetRating: "like" | "unlike") => {
    if (!id || !onRate) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onRate(id, targetRating);
  };

  return (
    <Animated.View
      entering={isUser ? FadeInUp.duration(300) : FadeInDown.duration(300)}
      className={`mb-3 px-4 ${isUser ? "items-end" : "items-start"}`}
    >
      {/* Bubble (Tap to skip typing animation while active; Long-press for contextual action menu) */}
      <Pressable
        onPress={isTyping && !isStreaming ? completeImmediately : undefined}
        onLongPress={handleLongPressBubble}
        delayLongPress={380}
        accessibilityRole="text"
        accessibilityLabel={
          isUser
            ? `Your question: ${content}`
            : activeTyping
              ? "Justif.ai is generating your legal answer"
              : undefined
        }
        accessibilityHint={!activeTyping ? "Long press for message actions" : undefined}
        style={{
          maxWidth: "88%",
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
        {/* Role label for assistant + Skip animation hint */}
        {!isUser && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 6,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Ionicons name="scale-outline" size={12} color={theme.textTertiary} />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: theme.textTertiary,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}
              >
                Justif.ai
              </Text>
            </View>

            {isTyping && !isStreaming && (
              <TouchableOpacity
                onPress={completeImmediately}
                accessibilityRole="button"
                accessibilityLabel="Skip typing animation"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "600",
                    color: theme.accent,
                  }}
                >
                  Tap to skip
                </Text>
                <Ionicons name="play-skip-forward" size={10} color={theme.accent} />
              </TouchableOpacity>
            )}
          </View>
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
        ) : activeTyping ? (
          /* Hide streamed token updates from TalkBack / VoiceOver to prevent reading every token */
          <View
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
          >
            <Text
              style={{
                fontSize: 15,
                lineHeight: 22,
                color: theme.assistantBubbleText,
              }}
            >
              {compactCitations(displayedText)}
              <Text style={{ color: theme.accent, fontWeight: "900" }}> ▊</Text>
            </Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {/* Section 1: Short Explanation Header Badge (for substantive legal responses) */}
            {hasSubstantiveStructure && (
              <View
                accessibilityRole="header"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingBottom: 2,
                }}
              >
                <Ionicons name="bulb-outline" size={14} color={theme.accent} />
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "800",
                    color: theme.accent,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Short Explanation
                </Text>
              </View>
            )}

            {parsedComponents.map((chunk, index) => {
              if (chunk.type === "markdown") {
                return (
                  <Markdown key={index} style={markdownStyle} rules={citationRules}>
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
                      {renderCitationText(chunk.value, `action-${index}`)}
                    </Text>
                  </View>
                );
              }
            })}

            {/* Section 3: Practical Next Steps */}
            {hasSubstantiveStructure && nextStepsText && (
              <View
                style={{
                  backgroundColor: theme.surfaceElevated,
                  borderRadius: 12,
                  padding: 12,
                  borderLeftWidth: 3,
                  borderLeftColor: theme.accent,
                  marginTop: 2,
                  gap: 6,
                }}
              >
                <View
                  accessibilityRole="header"
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <Ionicons name="checkmark-done-circle-outline" size={15} color={theme.accent} />
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "800",
                      color: theme.accent,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    Practical Next Steps
                  </Text>
                </View>
                <Markdown style={markdownStyle} rules={citationRules}>{nextStepsText}</Markdown>
                {onAskFollowUp && (
                  <TouchableOpacity
                    onPress={handleAskFollowUpAction}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Ask a follow-up question about next steps"
                    style={{
                      alignSelf: "flex-start",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      minHeight: 32,
                      borderRadius: 10,
                      backgroundColor: theme.cardBg,
                      borderWidth: 1,
                      borderColor: theme.border,
                      marginTop: 2,
                    }}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={13} color={theme.accent} />
                    <Text style={{ fontSize: 12, fontWeight: "600", color: theme.accent }}>
                      Ask Follow-up
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}
      </Pressable>

      {/* Timestamp, Quick Utility Actions (Copy/Listen/Share), and Rating Actions */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "wrap",
          marginTop: 5,
          marginHorizontal: 4,
          gap: 14,
        }}
      >
        {timestamp && (
          <Text
            {...singleLine}
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

        {!isUser && !activeTyping && (
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            {/* One-Tap Copy Button */}
            <TouchableOpacity
              onPress={handleCopy}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={copied ? "Copied response to clipboard" : "Copy response to clipboard"}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ flexDirection: "row", alignItems: "center", gap: 3, minHeight: 28 }}
            >
              <Ionicons
                name={copied ? "checkmark-outline" : "copy-outline"}
                size={13}
                color={copied ? theme.accent : theme.textTertiary}
              />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: copied ? "600" : "500",
                  color: copied ? theme.accent : theme.textTertiary,
                }}
              >
                {copied ? "Copied" : "Copy"}
              </Text>
            </TouchableOpacity>

            {/* Text-to-Speech Read Aloud Button */}
            <TouchableOpacity
              onPress={handleToggleSpeech}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={isSpeaking ? "Stop reading response aloud" : "Read response aloud"}
              accessibilityState={{ selected: isSpeaking }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ flexDirection: "row", alignItems: "center", gap: 3, minHeight: 28 }}
            >
              <Ionicons
                name={isSpeaking ? "stop-circle-outline" : "volume-medium-outline"}
                size={14}
                color={isSpeaking ? theme.accent : theme.textTertiary}
              />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: isSpeaking ? "600" : "500",
                  color: isSpeaking ? theme.accent : theme.textTertiary,
                }}
              >
                {isSpeaking ? "Stop" : "Listen"}
              </Text>
            </TouchableOpacity>

            {/* Native Share Button */}
            <TouchableOpacity
              onPress={handleShare}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Share response"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ flexDirection: "row", alignItems: "center", gap: 3, minHeight: 28 }}
            >
              <Ionicons
                name="share-social-outline"
                size={13}
                color={theme.textTertiary}
              />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "500",
                  color: theme.textTertiary,
                }}
              >
                Share
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {!isUser && !activeTyping && id && onRate && !rating && showRating && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginLeft: 4 }}>
            <TouchableOpacity
              onPress={() => handleRatePress("like")}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Mark response as helpful"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name={rating === "like" ? "thumbs-up" : "thumbs-up-outline"}
                size={14}
                color={rating === "like" ? theme.accent : theme.textTertiary}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleRatePress("unlike")}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Mark response as unhelpful"
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

      {/* ─── Long-Press Message Action Bottom Sheet ───────── */}
      <Modal
        visible={showActionSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowActionSheet(false)}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable
            onPress={() => setShowActionSheet(false)}
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
              paddingBottom: Math.max(
                insets.bottom + 16,
                Platform.OS === "ios" ? 36 : 24
              ),
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
                marginBottom: 16,
              }}
            />

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <Text
                accessibilityRole="header"
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: theme.text,
                }}
              >
                Message Actions
              </Text>
              <TouchableOpacity
                onPress={() => setShowActionSheet(false)}
                accessibilityRole="button"
                accessibilityLabel="Close message actions"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: theme.border,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons name="close" size={15} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 10 }}>
              {/* Copy Full Response */}
              <TouchableOpacity
                onPress={async () => {
                  setShowActionSheet(false);
                  await handleCopy();
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Copy Full Text: Copy message to clipboard"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: theme.cardBg,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 14,
                  padding: 13,
                  gap: 12,
                }}
              >
                <Ionicons name="copy-outline" size={20} color={theme.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text }}>
                    Copy Full Text
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 1 }}>
                    Copy message to clipboard
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Ask Follow-Up Question */}
              {onAskFollowUp && (
                <TouchableOpacity
                  onPress={handleAskFollowUpAction}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Ask Follow-up Question: Quote this message in your next legal query"
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: theme.cardBg,
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 14,
                    padding: 13,
                    gap: 12,
                  }}
                >
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={20}
                    color={theme.accent}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text }}>
                      Ask Follow-up Question
                    </Text>
                    <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 1 }}>
                      Quote this message in your next legal query
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* Listen / Read Aloud */}
              {!isUser && (
                <TouchableOpacity
                  onPress={() => {
                    setShowActionSheet(false);
                    handleToggleSpeech();
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={isSpeaking ? "Stop Reading Aloud" : "Read Response Aloud"}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: theme.cardBg,
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 14,
                    padding: 13,
                    gap: 12,
                  }}
                >
                  <Ionicons
                    name={isSpeaking ? "stop-circle-outline" : "volume-medium-outline"}
                    size={20}
                    color={theme.accent}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text }}>
                      {isSpeaking ? "Stop Reading Aloud" : "Read Response Aloud"}
                    </Text>
                    <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 1 }}>
                      Listen to legal explanation via Text-to-Speech
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* Share Summary */}
              <TouchableOpacity
                onPress={() => {
                  setShowActionSheet(false);
                  void handleShare();
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Share Legal Summary"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: theme.cardBg,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 14,
                  padding: 13,
                  gap: 12,
                }}
              >
                <Ionicons name="share-social-outline" size={20} color={theme.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text }}>
                    Share Legal Summary
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 1 }}>
                    Send via messaging apps or email
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Report Inaccurate Citation */}
              {!isUser && (
                <TouchableOpacity
                  onPress={handleReportInaccurateCitation}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Report Inaccurate Citation"
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: theme.cardBg,
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 14,
                    padding: 13,
                    gap: 12,
                  }}
                >
                  <Ionicons name="flag-outline" size={20} color="#EF4444" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#EF4444" }}>
                      Report Inaccurate Citation
                    </Text>
                    <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 1 }}>
                      Flag this response for Philippine legal QA review
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </Animated.View>
  );
}

export default React.memo(ChatBubble, (prev, next) => {
  return (
    prev.id === next.id &&
    prev.content === next.content &&
    prev.rating === next.rating &&
    prev.role === next.role &&
    prev.timestamp === next.timestamp &&
    prev.sources === next.sources &&
    prev.onRate === next.onRate &&
    prev.onAskFollowUp === next.onAskFollowUp &&
    prev.onCitationPress === next.onCitationPress &&
    prev.animateTyping === next.animateTyping &&
    prev.isStreaming === next.isStreaming
  );
});
