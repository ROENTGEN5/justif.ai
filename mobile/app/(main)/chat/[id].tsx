/**
 * Existing Chat Screen
 * Loads and displays a specific chat conversation by ID.
 * Supports RAG-powered responses with source citations, law type filtering,
 * explicit language selection, and file upload for legal document analysis.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  Alert,
  Modal,
  TouchableOpacity,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  AccessibilityInfo,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Strings } from "../../../constants/Strings";
import ChatMessage from "../../../components/ChatMessage";
import ChatInput from "../../../components/ChatInput";
import ChatSkeleton from "../../../components/ChatSkeleton";
import FloatingScrollButton from "../../../components/FloatingScrollButton";
import {
  LANGUAGE_OPTIONS,
  PreferredLanguage,
} from "../../../components/GuidedTopicFlow";
import LoadingDots from "../../../components/LoadingDots";
import FilterChips from "../../../components/FilterChips";
import {
  newRequestId,
  streamMessage,
  getChatMessages,
  getCachedChatMessages,
  cacheChatMessages,
  getLawTypes,
  analyzeFile,
  rateMessage,
  LawSource,
  FileAttachment,
} from "../../../lib/api";
import { cacheOwner } from "../../../lib/conversationCache";
import { useTheme } from "../../../lib/theme";
import { textFix } from "../../../lib/textFix";

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  rating?: "like" | "unlike";
  sources?: LawSource[];
  animateTyping?: boolean;
  isStreaming?: boolean;
}

function announceScreenReader(message: string) {
  try {
    AccessibilityInfo.announceForAccessibility(message);
  } catch {
    // Ignore if unavailable on web/test environment
  }
}

export default function ExistingChatScreen() {
  const { id: chatId } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const activeStream = useRef<AbortController | null>(null);
  const requestBusy = useRef(false);
  const requestContext = useRef<{ chatId?: string; lawTypes?: string[] }>({});
  const [failedRequest, setFailedRequest] = useState<{
    id: string;
    text?: string;
    file?: FileAttachment;
    prompt?: string;
    error: string;
  } | null>(null);

  useEffect(
    () => () => {
      activeStream.current?.abort();
      activeStream.current = null;
    },
    []
  );

  const [isLoading, setIsLoading] = useState(false);
  const [thinkingStage, setThinkingStage] = useState<string | undefined>(undefined);
  const [isFetchingHistory, setIsFetchingHistory] = useState(true);
  const [preferredLanguage, setPreferredLanguage] = useState<PreferredLanguage>("English");
  const [prefillText, setPrefillText] = useState<string | undefined>(undefined);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const isScrolledUpRef = useRef(false);
  const flatListRef = useRef<FlatList>(null);

  // Reviews & tracking
  const [sessionQueries, setSessionQueries] = useState(0);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewMessageId, setReviewMessageId] = useState<string | null>(null);
  const [showThankYou, setShowThankYou] = useState(false);

  // Filter state
  const [lawTypes, setLawTypes] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  // Fetch law types
  useEffect(() => {
    getLawTypes().then(setLawTypes).catch(() => {});
  }, []);

  const scrollToBottom = useCallback(() => {
    if (isScrolledUpRef.current) return;
    if (flatListRef.current && messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const forceScrollToBottom = useCallback(() => {
    isScrolledUpRef.current = false;
    setIsScrolledUp(false);
    if (flatListRef.current && messages.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
      const distanceFromBottom =
        contentSize.height - (layoutMeasurement.height + contentOffset.y);
      const scrolledUp = distanceFromBottom > 180;
      if (scrolledUp !== isScrolledUpRef.current) {
        isScrolledUpRef.current = scrolledUp;
        setIsScrolledUp(scrolledUp);
      }
    },
    []
  );

  const handleAskFollowUp = useCallback((quote: string) => {
    setPrefillText(`Regarding "${quote}": `);
  }, []);

  const handleClearPrefill = useCallback(() => {
    setPrefillText(undefined);
  }, []);

  const isAnyMessageTyping = useMemo(
    () =>
      isLoading ||
      messages.some((m) => Boolean(m.animateTyping || m.isStreaming)),
    [isLoading, messages]
  );

  // Auto-scroll when the keyboard opens
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const sub = Keyboard.addListener(showEvent, () => {
      scrollToBottom();
    });
    return () => sub.remove();
  }, [scrollToBottom]);

  // Fetch existing messages on mount (display offline cache immediately while refreshing)
  useEffect(() => {
    if (!chatId) return;
    let isMounted = true;

    const fetchMessages = async () => {
      try {
        setIsFetchingHistory(true);
        const cached = await getCachedChatMessages(chatId);
        if (isMounted && cached.length > 0) {
          setMessages(
            cached.map((msg) => ({
              id: msg.id,
              role: msg.role as "user" | "assistant",
              content: msg.content,
              created_at: msg.created_at,
              sources: msg.sources,
              rating: msg.rating as "like" | "unlike" | undefined,
            }))
          );
          setIsFetchingHistory(false);
        }

        const data = await getChatMessages(chatId);
        if (isMounted) {
          setMessages(
            data.map((msg) => ({
              id: msg.id,
              role: msg.role as "user" | "assistant",
              content: msg.content,
              created_at: msg.created_at,
              sources: msg.sources,
              rating: msg.rating as "like" | "unlike" | undefined,
            }))
          );
        }
      } catch (error: any) {
        if (isMounted) {
          if (error?.status === 404 || error?.status === 403) {
            setMessages([]);
          }
          Alert.alert("Error", error.message || Strings.errorGeneric);
        }
      } finally {
        if (isMounted) {
          setIsFetchingHistory(false);
        }
      }
    };

    fetchMessages();
    return () => {
      isMounted = false;
    };
  }, [chatId]);

  const handleToggleFilter = useCallback((type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }, []);

  const handleClearFilters = useCallback(() => {
    setSelectedTypes([]);
  }, []);

  const handleTypingComplete = useCallback((msgId?: string) => {
    if (!msgId) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, animateTyping: false, isStreaming: false } : m
      )
    );
  }, []);

  const handleSend = useCallback(
    async (text: string, retryId?: string) => {
      if (requestBusy.current || (failedRequest && !retryId)) return;
      if (!chatId) return;

      requestBusy.current = true;
      const requestId = retryId || newRequestId();
      if (!retryId) {
        requestContext.current = {
          chatId: chatId || undefined,
          lawTypes: selectedTypes.length ? selectedTypes : undefined,
        };
      }
      setFailedRequest(null);
      const owner = await cacheOwner();
      const userMsg: DisplayMessage = {
        id: `user-${requestId}`,
        role: "user",
        content: text,
        created_at: new Date().toISOString(),
      };
      const streamMsgId = `assistant-${requestId}`;
      const streamCreatedAt = new Date().toISOString();

      if (!retryId) setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);
      setThinkingStage(undefined);
      announceScreenReader("Loading legal answer. Please wait.");

      const controller = new AbortController();
      activeStream.current = controller;
      try {
        const response = await streamMessage(
          text,
          requestContext.current.chatId,
          requestContext.current.lawTypes,
          {
            onThinkingStage: (stage) => {
              if (controller.signal.aborted) return;
              setThinkingStage(stage);
            },
            onToken: (accumulatedText) => {
              if (controller.signal.aborted) return;
              setIsLoading(false);
              setThinkingStage(undefined);
              setMessages((prev) => {
                const exists = prev.some((m) => m.id === streamMsgId);
                if (exists) {
                  return prev.map((m) =>
                    m.id === streamMsgId
                      ? {
                          ...m,
                          content: accumulatedText,
                          isStreaming: true,
                          animateTyping: false,
                        }
                      : m
                  );
                }
                return [
                  ...prev,
                  {
                    id: streamMsgId,
                    role: "assistant",
                    content: accumulatedText,
                    created_at: streamCreatedAt,
                    animateTyping: false,
                    isStreaming: true,
                  },
                ];
              });
            },
          },
          controller.signal,
          requestId
        );

        const newCount = sessionQueries + 1;
        setSessionQueries(newCount);

        const finalId = response.message_id || streamMsgId;
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === streamMsgId);
          const updated: DisplayMessage[] = exists
            ? prev.map((m) =>
                m.id === streamMsgId
                  ? {
                      ...m,
                      id: finalId,
                      content: response.response,
                      sources: response.sources,
                      animateTyping: false,
                      isStreaming: false,
                    }
                  : m
              )
            : [
                ...prev,
                {
                  id: finalId,
                  role: "assistant",
                  content: response.response,
                  created_at: streamCreatedAt,
                  sources: response.sources,
                  animateTyping: false,
                  isStreaming: false,
                },
              ];
          if (owner) void cacheChatMessages(chatId, updated, owner);
          return updated;
        });

        announceScreenReader(
          `Legal answer complete with ${response.sources?.length || 0} cited sources.`
        );

        // Pop up every 3 queries
        if (newCount % 3 === 0 && response.message_id) {
          setReviewMessageId(response.message_id);
          setShowReviewModal(true);
        }
      } catch (error: any) {
        if (controller.signal.aborted) return;
        const errMsg = error.message || Strings.errorMessageSend;
        setFailedRequest({ id: requestId, text, error: errMsg });
        if (/sign in|expired|session/i.test(errMsg)) {
          setPrefillText(text);
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamMsgId
              ? { ...m, isStreaming: false, animateTyping: false }
              : m
          )
        );
        announceScreenReader(
          `Request interrupted. ${errMsg}. Use Retry to recover or resend.`
        );
      } finally {
        requestBusy.current = false;
        if (activeStream.current === controller) activeStream.current = null;
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setThinkingStage(undefined);
        }
      }
    },
    [chatId, selectedTypes, sessionQueries, failedRequest]
  );

  const handleFileSelected = useCallback(
    async (file: FileAttachment, userPrompt?: string, retryId?: string) => {
      if (requestBusy.current || (failedRequest && !retryId)) return;
      if (!chatId) return;

      requestBusy.current = true;
      const requestId = retryId || newRequestId();
      if (!retryId) requestContext.current = { chatId: chatId || undefined };
      setFailedRequest(null);
      const owner = await cacheOwner();
      const displayContent = userPrompt
        ? `📎 Uploaded: ${file.name}\n\n${userPrompt}`
        : `📎 Uploaded: ${file.name}`;

      const userMsg: DisplayMessage = {
        id: `user-file-${requestId}`,
        role: "user",
        content: displayContent,
        created_at: new Date().toISOString(),
      };

      if (!retryId) setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);
      setThinkingStage("Reading & analyzing legal document...");
      announceScreenReader("Uploading and analyzing legal document. Please wait.");

      try {
        const response = await analyzeFile(
          file,
          requestContext.current.chatId,
          userPrompt,
          requestId
        );

        const newCount = sessionQueries + 1;
        setSessionQueries(newCount);

        const assistantMsg: DisplayMessage = {
          id: response.message_id || `assistant-file-${Date.now()}`,
          role: "assistant",
          content: response.response,
          created_at: new Date().toISOString(),
          sources: response.sources,
          animateTyping: true,
          isStreaming: false,
        };

        setMessages((prev) => {
          const updated = [...prev, assistantMsg];
          if (owner) void cacheChatMessages(chatId, updated, owner);
          return updated;
        });

        announceScreenReader(
          `Document analysis complete with ${response.sources?.length || 0} cited sources.`
        );

        if (newCount % 3 === 0 && response.message_id) {
          setReviewMessageId(response.message_id);
          setShowReviewModal(true);
        }
      } catch (error: any) {
        const errMsg = error.message || Strings.fileUploadError;
        setFailedRequest({
          id: requestId,
          file,
          prompt: userPrompt,
          error: errMsg,
        });
        if (userPrompt && /sign in|expired|session/i.test(errMsg)) {
          setPrefillText(userPrompt);
        }
        announceScreenReader(
          `Document upload interrupted. ${errMsg}. Use Retry to try again.`
        );
      } finally {
        requestBusy.current = false;
        setIsLoading(false);
        setThinkingStage(undefined);
      }
    },
    [chatId, sessionQueries, failedRequest]
  );

  const handleRate = useCallback(
    async (id: string, rating: "like" | "unlike") => {
      try {
        // Optimistic update
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, rating } : m))
        );
        await rateMessage(id, rating);
        if (showReviewModal) setShowReviewModal(false);

        // Show custom thank you toast
        setShowThankYou(true);
        setTimeout(() => setShowThankYou(false), 2500);
      } catch {
        // Revert if error
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, rating: undefined } : m))
        );
        Alert.alert("Error", "Could not submit review.");
      }
    },
    [showReviewModal]
  );

  const renderItem = useCallback(
    ({ item }: { item: DisplayMessage }) => (
      <View>
        <ChatMessage
          id={item.id}
          role={item.role}
          content={item.content}
          timestamp={item.created_at}
          sources={item.sources}
          rating={item.rating}
          onRate={handleRate}
          onAskFollowUp={handleAskFollowUp}
          animateTyping={item.animateTyping}
          isStreaming={item.isStreaming}
          onTypingTick={scrollToBottom}
          onTypingComplete={handleTypingComplete}
        />
      </View>
    ),
    [handleRate, handleAskFollowUp, scrollToBottom, handleTypingComplete]
  );

  // Loading state while fetching history (UI-thread Skeleton Loader)
  if (isFetchingHistory) {
    return (
      <View
        accessible={true}
        accessibilityLabel="Loading conversation history"
        style={{ flex: 1, backgroundColor: theme.background }}
      >
        <ChatSkeleton />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 80}
    >
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {/* Filter bar */}
        {lawTypes.length > 0 && (
          <FilterChips
            lawTypes={lawTypes}
            selectedTypes={selectedTypes}
            onToggle={handleToggleFilter}
            onClear={handleClearFilters}
          />
        )}

        {/* Explicit Language Selector Bar */}
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Response language selector"
          style={{
            flexDirection: "column",
            alignItems: "stretch",
            paddingHorizontal: 14,
            paddingVertical: 6,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
            backgroundColor: theme.background,
            gap: 6,
          }}
        >
          <Text {...textFix} style={{ paddingHorizontal: 2, fontSize: 11, fontWeight: "600", color: theme.textTertiary }}>
            Language:
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {LANGUAGE_OPTIONS.map((option) => {
              const selected = preferredLanguage === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  accessibilityRole="radio"
                  accessibilityLabel={`Answer in ${option.label}`}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setPreferredLanguage(option.id);
                  }}
                  style={{
                    flexGrow: 1,
                    flexBasis: 80,
                    minWidth: 80,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    minHeight: 28,
                    borderRadius: 12,
                    backgroundColor: selected ? theme.chipActiveBg : theme.chipBg,
                    borderWidth: 1,
                    borderColor: selected ? theme.chipActiveBg : theme.chipBorder,
                    justifyContent: "center",
                  }}
                >
                  <Text
                    {...textFix}
                    style={{
                      paddingHorizontal: 2,
                      textAlign: "center",
                      fontSize: 11,
                      fontWeight: selected ? "700" : "500",
                      color: selected ? theme.chipActiveText : theme.chipText,
                    }}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Messages list */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews={Platform.OS === "android"}
          updateCellsBatchingPeriod={50}
          contentContainerStyle={{
            paddingTop: 16,
            paddingBottom: 24,
            flexGrow: messages.length === 0 ? 1 : undefined,
          }}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onContentSizeChange={scrollToBottom}
          onLayout={scrollToBottom}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            isLoading ? <LoadingDots stageText={thinkingStage} /> : undefined
          }
          ListEmptyComponent={
            <View
              style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
                paddingHorizontal: 32,
              }}
            >
              <Text
                style={{
                  fontSize: 15,
                  color: theme.textTertiary,
                  textAlign: "center",
                }}
              >
                {Strings.chatWelcome}
              </Text>
            </View>
          }
        />

        <FloatingScrollButton
          visible={messages.length > 0 && isScrolledUp}
          isTypingOrLoading={isAnyMessageTyping}
          onPress={forceScrollToBottom}
        />

        {/* Input bar */}
        {failedRequest && (
          <View
            accessibilityLiveRegion="polite"
            style={{
              padding: 12,
              backgroundColor: theme.surfaceElevated,
              borderTopWidth: 1,
              borderTopColor: theme.border,
              gap: 6,
            }}
          >
            <Text style={{ color: theme.text, fontSize: 13, lineHeight: 18 }}>
              Request interrupted. Any partial answer above is incomplete.{" "}
              {failedRequest.error}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Retry or recover saved result"
                onPress={() =>
                  failedRequest.file
                    ? void handleFileSelected(
                        failedRequest.file,
                        failedRequest.prompt,
                        failedRequest.id
                      )
                    : void handleSend(failedRequest.text || "", failedRequest.id)
                }
                style={{ minHeight: 36, justifyContent: "center" }}
              >
                <Text style={{ color: theme.accent, fontWeight: "700" }}>
                  Retry / recover saved result
                </Text>
              </TouchableOpacity>
              {failedRequest.text && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Restore draft to input box"
                  onPress={() => {
                    setPrefillText(failedRequest.text);
                    setFailedRequest(null);
                  }}
                  style={{ minHeight: 36, justifyContent: "center" }}
                >
                  <Text style={{ color: theme.textSecondary, fontWeight: "600" }}>
                    Restore draft
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Dismiss error notice"
                onPress={() => setFailedRequest(null)}
                style={{ minHeight: 36, justifyContent: "center" }}
              >
                <Text style={{ color: theme.textSecondary }}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        <ChatInput
          onSend={handleSend}
          onFileSelected={handleFileSelected}
          onFocus={scrollToBottom}
          isLoading={isLoading}
          prefillText={prefillText}
          onClearPrefill={handleClearPrefill}
        />

        {/* Review Modal */}
        <Modal visible={showReviewModal} transparent animationType="fade">
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.5)",
              justifyContent: "center",
              alignItems: "center",
              padding: 20,
            }}
          >
            <View
              style={{
                backgroundColor: theme.surfaceElevated,
                padding: 24,
                borderRadius: 16,
                width: "100%",
                maxWidth: 320,
                alignItems: "center",
              }}
            >
              <Ionicons
                name="star"
                size={40}
                color={theme.accent}
                style={{ marginBottom: 12 }}
              />
              <Text
                accessibilityRole="header"
                style={{
                  fontSize: 18,
                  fontWeight: "700",
                  color: theme.text,
                  marginBottom: 8,
                  textAlign: "center",
                }}
              >
                How did we do?
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: theme.textTertiary,
                  textAlign: "center",
                  marginBottom: 24,
                }}
              >
                Help us improve! Was the last answer accurate and helpful?
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  gap: 16,
                  marginBottom: 16,
                  width: "100%",
                }}
              >
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Rate last answer as good"
                  onPress={() =>
                    reviewMessageId && handleRate(reviewMessageId, "like")
                  }
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 12,
                    minHeight: 44,
                    borderRadius: 8,
                    backgroundColor: theme.surfaceElevated,
                    borderWidth: 1,
                    borderColor: theme.border,
                    gap: 8,
                  }}
                >
                  <Ionicons name="thumbs-up-outline" size={18} color={theme.text} />
                  <Text style={{ color: theme.text, fontWeight: "600" }}>Good</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Rate last answer as bad"
                  onPress={() =>
                    reviewMessageId && handleRate(reviewMessageId, "unlike")
                  }
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 12,
                    minHeight: 44,
                    borderRadius: 8,
                    backgroundColor: theme.surfaceElevated,
                    borderWidth: 1,
                    borderColor: theme.border,
                    gap: 8,
                  }}
                >
                  <Ionicons
                    name="thumbs-down-outline"
                    size={18}
                    color={theme.text}
                  />
                  <Text style={{ color: theme.text, fontWeight: "600" }}>Bad</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Skip rating for now"
                onPress={() => setShowReviewModal(false)}
                style={{ padding: 8, minHeight: 36, justifyContent: "center" }}
              >
                <Text style={{ color: theme.textTertiary, fontSize: 14 }}>
                  Skip for now
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ─── Custom Thank You Toast ────────────────────────── */}
        {showThankYou && (
          <Animated.View
            entering={FadeInDown.duration(300)}
            exiting={FadeOutDown.duration(300)}
            accessibilityLiveRegion="polite"
            style={{
              position: "absolute",
              bottom: Platform.OS === "ios" ? 110 : 90,
              alignSelf: "center",
              backgroundColor: theme.accent,
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 20,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.15,
              shadowRadius: 4,
              elevation: 4,
              zIndex: 100,
            }}
          >
            <Ionicons name="checkmark-circle" size={16} color={theme.accentText} />
            <Text
              style={{
                color: theme.accentText,
                fontSize: 13,
                fontWeight: "600",
              }}
            >
              Thank you for your feedback!
            </Text>
          </Animated.View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
