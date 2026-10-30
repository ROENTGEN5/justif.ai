/**
 * New Chat Screen (Default)
 * RAG-powered chat with guided question flows, explicit language selection
 * (English, Filipino, Taglish), law type filtering, source citations,
 * and file upload for legal document analysis.
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  AccessibilityInfo,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Strings } from "../../../constants/Strings";
import ChatBubble from "../../../components/ChatBubble";
import ChatInput from "../../../components/ChatInput";
import FloatingScrollButton from "../../../components/FloatingScrollButton";
import GuidedTopicFlow, {
  LANGUAGE_OPTIONS,
  PreferredLanguage,
} from "../../../components/GuidedTopicFlow";
import LoadingDots from "../../../components/LoadingDots";
import SourceCard from "../../../components/SourceCard";
import FilterChips from "../../../components/FilterChips";
import {
  newRequestId,
  streamMessage,
  getLawTypes,
  analyzeFile,
  LawSource,
  FileAttachment,
} from "../../../lib/api";
import { useTheme } from "../../../lib/theme";

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
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

export default function NewChatScreen() {
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
  const [chatId, setChatId] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string>("labor");
  const [preferredLanguage, setPreferredLanguage] = useState<PreferredLanguage>("English");
  const [prefillText, setPrefillText] = useState<string | undefined>(undefined);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const isScrolledUpRef = useRef(false);
  const flatListRef = useRef<FlatList>(null);

  // Filter state
  const [lawTypes, setLawTypes] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  // Fetch available law types on mount
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
      requestBusy.current = true;
      const requestId = retryId || newRequestId();
      if (!retryId) {
        requestContext.current = {
          chatId: chatId || undefined,
          lawTypes: selectedTypes.length ? selectedTypes : undefined,
        };
      }
      setFailedRequest(null);
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

        if (!chatId) {
          setChatId(response.chat_id);
        }

        const finalId = response.message_id || streamMsgId;
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === streamMsgId);
          if (exists) {
            return prev.map((m) =>
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
            );
          }
          return [
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
        });
        announceScreenReader(
          `Legal answer complete with ${response.sources?.length || 0} cited sources.`
        );
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
    [chatId, selectedTypes, failedRequest]
  );

  const handleFileSelected = useCallback(
    async (file: FileAttachment, userPrompt?: string, retryId?: string) => {
      if (requestBusy.current || (failedRequest && !retryId)) return;
      requestBusy.current = true;
      const requestId = retryId || newRequestId();
      if (!retryId) requestContext.current = { chatId: chatId || undefined };
      setFailedRequest(null);
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

        if (!chatId) {
          setChatId(response.chat_id);
        }

        const assistantMsg: DisplayMessage = {
          id: response.message_id || `assistant-file-${Date.now()}`,
          role: "assistant",
          content: response.response,
          created_at: new Date().toISOString(),
          sources: response.sources,
          animateTyping: true,
          isStreaming: false,
        };

        setMessages((prev) => [...prev, assistantMsg]);
        announceScreenReader(
          `Document analysis complete with ${response.sources?.length || 0} cited sources.`
        );
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
    [chatId, failedRequest]
  );

  const renderWelcomeHeader = () => {
    if (messages.length > 0) return null;

    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingVertical: 20,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Image
          source={require("../../../assets/logo.png")}
          accessibilityIgnoresInvertColors
          style={{
            width: 64,
            height: 64,
            marginBottom: 12,
            borderRadius: 16,
          }}
          contentFit="cover"
        />

        <Text
          accessibilityRole="header"
          style={{
            fontSize: 22,
            fontWeight: "800",
            color: theme.text,
            textAlign: "center",
            marginBottom: 6,
          }}
        >
          {Strings.welcome}
        </Text>

        <Text
          style={{
            fontSize: 14,
            color: theme.textSecondary,
            textAlign: "center",
            lineHeight: 20,
            maxWidth: 340,
          }}
        >
          {Strings.chatWelcome}
        </Text>

        <GuidedTopicFlow
          activeCategoryId={activeCategoryId}
          onSelectCategory={setActiveCategoryId}
          preferredLanguage={preferredLanguage}
          onSelectLanguage={setPreferredLanguage}
          onSubmitPrompt={(prompt) => void handleSend(prompt)}
          onPrefillPrompt={(prompt) => setPrefillText(prompt)}
        />
      </ScrollView>
    );
  };

  const renderItem = useCallback(
    ({ item }: { item: DisplayMessage }) => (
      <View>
        <ChatBubble
          id={item.id}
          role={item.role}
          content={item.content}
          timestamp={item.created_at}
          sources={item.sources}
          onAskFollowUp={handleAskFollowUp}
          animateTyping={item.animateTyping}
          isStreaming={item.isStreaming}
          onTypingTick={scrollToBottom}
          onTypingComplete={handleTypingComplete}
        />
        {item.role === "assistant" &&
          !item.animateTyping &&
          !item.isStreaming &&
          item.sources &&
          item.sources.length > 0 && (
            <SourceCard sources={item.sources} answer={item.content} />
          )}
      </View>
    ),
    [handleAskFollowUp, scrollToBottom, handleTypingComplete]
  );

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

        {/* Active conversation language bar */}
        {messages.length > 0 && (
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Response language selector"
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 14,
              paddingVertical: 6,
              borderBottomWidth: 1,
              borderBottomColor: theme.border,
              backgroundColor: theme.background,
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: "600", color: theme.textTertiary }}>
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
                      style={{
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
        )}

        {/* Messages list */}
        {messages.length === 0 ? (
          renderWelcomeHeader()
        ) : (
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
              paddingBottom: 16,
            }}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onContentSizeChange={scrollToBottom}
            onLayout={scrollToBottom}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
            ListFooterComponent={
              isLoading ? <LoadingDots stageText={thinkingStage} /> : null
            }
          />
        )}

        <FloatingScrollButton
          visible={messages.length > 0 && isScrolledUp}
          isTypingOrLoading={isAnyMessageTyping}
          onPress={forceScrollToBottom}
        />

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
      </View>
    </KeyboardAvoidingView>
  );
}
