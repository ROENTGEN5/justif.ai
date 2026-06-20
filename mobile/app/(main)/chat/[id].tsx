/**
 * Existing Chat Screen
 * Loads and displays a specific chat conversation by ID.
 * Supports RAG-powered responses with source citations, law type filtering,
 * and file upload for legal document analysis.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useHeaderHeight } from "@react-navigation/elements";
import { useLocalSearchParams } from "expo-router";
import Strings from "../../../constants/Strings";
import ChatBubble from "../../../components/ChatBubble";
import ChatInput from "../../../components/ChatInput";
import LoadingDots from "../../../components/LoadingDots";
import SourceCard from "../../../components/SourceCard";
import FilterChips from "../../../components/FilterChips";
import {
  sendMessage,
  getChatMessages,
  getLawTypes,
  analyzeFile,
  rateMessage,
  LawSource,
  FileAttachment,
} from "../../../lib/api";
import { useTheme } from "../../../lib/theme";
import { Ionicons } from "@expo/vector-icons";

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  rating?: "like" | "unlike";
  sources?: LawSource[];
}

export default function ExistingChatScreen() {
  const { id: chatId } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const headerHeight = useHeaderHeight();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingHistory, setIsFetchingHistory] = useState(true);
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

  // Fetch existing messages on mount
  useEffect(() => {
    if (!chatId) return;

    const fetchMessages = async () => {
      try {
        setIsFetchingHistory(true);
        const data = await getChatMessages(chatId);
        setMessages(
          data.map((msg) => ({
            id: msg.id,
            role: msg.role as "user" | "assistant",
            content: msg.content,
            created_at: msg.created_at,
            rating: msg.rating as "like" | "unlike" | undefined,
          }))
        );
      } catch (error: any) {
        Alert.alert("Error", error.message || Strings.errorGeneric);
      } finally {
        setIsFetchingHistory(false);
      }
    };

    fetchMessages();
  }, [chatId]);

  const handleToggleFilter = useCallback((type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }, []);

  const handleClearFilters = useCallback(() => {
    setSelectedTypes([]);
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      if (!chatId) return;

      const userMsg: DisplayMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      try {
        const response = await sendMessage(
          text,
          chatId,
          selectedTypes.length > 0 ? selectedTypes : undefined,
        );

        const newCount = sessionQueries + 1;
        setSessionQueries(newCount);

        const assistantMsg: DisplayMessage = {
          id: response.message_id || `assistant-${Date.now()}`,
          role: "assistant",
          content: response.response,
          created_at: new Date().toISOString(),
          sources: response.sources,
        };

        setMessages((prev) => [...prev, assistantMsg]);

        // Pop up every 3 queries
        if (newCount % 3 === 0 && response.message_id) {
          setReviewMessageId(response.message_id);
          setShowReviewModal(true);
        }
      } catch (error: any) {
        Alert.alert("Error", error.message || Strings.errorMessageSend);
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      } finally {
        setIsLoading(false);
      }
    },
    [chatId, selectedTypes]
  );

  const handleFileSelected = useCallback(
    async (file: FileAttachment) => {
      if (!chatId) return;

      const userMsg: DisplayMessage = {
        id: `user-file-${Date.now()}`,
        role: "user",
        content: `📎 Uploaded: ${file.name}`,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      try {
        const response = await analyzeFile(file, chatId);

        const newCount = sessionQueries + 1;
        setSessionQueries(newCount);

        const assistantMsg: DisplayMessage = {
          id: response.message_id || `assistant-file-${Date.now()}`,
          role: "assistant",
          content: response.response,
          created_at: new Date().toISOString(),
          sources: response.sources,
        };

        setMessages((prev) => [...prev, assistantMsg]);

        if (newCount % 3 === 0 && response.message_id) {
          setReviewMessageId(response.message_id);
          setShowReviewModal(true);
        }
      } catch (error: any) {
        Alert.alert("Error", error.message || Strings.fileUploadError);
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      } finally {
        setIsLoading(false);
      }
    },
    [chatId]
  );

  const scrollToBottom = useCallback(() => {
    if (flatListRef.current && messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const handleRate = useCallback(async (id: string, rating: "like" | "unlike") => {
    try {
      // Optimistic update
      setMessages((prev) => prev.map((m) => m.id === id ? { ...m, rating } : m));
      await rateMessage(id, rating);
      if (showReviewModal) setShowReviewModal(false);
      
      // Show custom thank you toast
      setShowThankYou(true);
      setTimeout(() => setShowThankYou(false), 2500);
    } catch (e) {
      // Revert if error
      setMessages((prev) => prev.map((m) => m.id === id ? { ...m, rating: undefined } : m));
      Alert.alert("Error", "Could not submit review.");
    }
  }, [showReviewModal]);

  const renderItem = useCallback(({ item }: { item: DisplayMessage }) => (
    <View>
      <ChatBubble
        id={item.id}
        role={item.role}
        content={item.content}
        timestamp={item.created_at}
        rating={item.rating}
        onRate={handleRate}
      />
      {item.role === "assistant" && item.sources && item.sources.length > 0 && (
        <SourceCard sources={item.sources} />
      )}
    </View>
  ), []);

  // Loading state while fetching history
  if (isFetchingHistory) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: theme.background,
        }}
      >
        <ActivityIndicator size="large" color={theme.accent} />
        <Text
          style={{
            fontSize: 14,
            color: theme.textTertiary,
            marginTop: 12,
          }}
        >
          {Strings.loading}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
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

      {/* Messages list */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{
          paddingTop: 16,
          paddingBottom: 150,
          flexGrow: messages.length === 0 ? 1 : undefined,
        }}
        onContentSizeChange={scrollToBottom}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={isLoading ? <LoadingDots /> : null}
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

      {/* Input bar */}
      <ChatInput
        onSend={handleSend}
        onFileSelected={handleFileSelected}
        isLoading={isLoading}
      />

      {/* Review Modal */}
      <Modal visible={showReviewModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 }}>
          <View style={{ backgroundColor: theme.surfaceElevated, padding: 24, borderRadius: 16, width: "100%", maxWidth: 320, alignItems: "center" }}>
            <Ionicons name="star" size={40} color={theme.accent} style={{ marginBottom: 12 }} />
            <Text style={{ fontSize: 18, fontWeight: "700", color: theme.text, marginBottom: 8, textAlign: "center" }}>
              How did we do?
            </Text>
            <Text style={{ fontSize: 14, color: theme.textTertiary, textAlign: "center", marginBottom: 24 }}>
              Help us improve! Was the last answer accurate and helpful?
            </Text>
            
            <View style={{ flexDirection: "row", gap: 16, marginBottom: 16, width: "100%" }}>
              <TouchableOpacity
                onPress={() => reviewMessageId && handleRate(reviewMessageId, "like")}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 12, borderRadius: 8, backgroundColor: theme.surfaceHover, borderWidth: 1, borderColor: theme.border, gap: 8 }}
              >
                <Ionicons name="thumbs-up-outline" size={18} color={theme.text} />
                <Text style={{ color: theme.text, fontWeight: "600" }}>Good</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => reviewMessageId && handleRate(reviewMessageId, "unlike")}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 12, borderRadius: 8, backgroundColor: theme.surfaceHover, borderWidth: 1, borderColor: theme.border, gap: 8 }}
              >
                <Ionicons name="thumbs-down-outline" size={18} color={theme.text} />
                <Text style={{ color: theme.text, fontWeight: "600" }}>Bad</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={() => setShowReviewModal(false)} style={{ padding: 8 }}>
              <Text style={{ color: theme.textTertiary, fontSize: 14 }}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ─── Custom Thank You Toast ────────────────────────── */}
      {showThankYou && (
        <Animated.View
          entering={FadeInDown.duration(300)}
          exiting={FadeOutDown.duration(300)}
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
          <Text style={{ color: theme.accentText, fontSize: 13, fontWeight: "600" }}>
            Thank you for your feedback!
          </Text>
        </Animated.View>
      )}

      </View>
    </KeyboardAvoidingView>
  );
}
