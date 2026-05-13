/**
 * Existing Chat Screen
 * Loads and displays a specific chat conversation by ID.
 * Supports RAG-powered responses with source citations and law type filtering.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";
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
  LawSource,
} from "../../../lib/api";
import { useTheme } from "../../../lib/theme";

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  sources?: LawSource[];
}

export default function ExistingChatScreen() {
  const { id: chatId } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingHistory, setIsFetchingHistory] = useState(true);
  const flatListRef = useRef<FlatList>(null);

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

        const assistantMsg: DisplayMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: response.response,
          created_at: new Date().toISOString(),
          sources: response.sources,
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } catch (error: any) {
        Alert.alert("Error", error.message || Strings.errorMessageSend);
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      } finally {
        setIsLoading(false);
      }
    },
    [chatId, selectedTypes]
  );

  const scrollToBottom = useCallback(() => {
    if (flatListRef.current && messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const renderItem = useCallback(({ item }: { item: DisplayMessage }) => (
    <View>
      <ChatBubble
        role={item.role}
        content={item.content}
        timestamp={item.created_at}
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
          paddingBottom: 8,
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
      <ChatInput onSend={handleSend} isLoading={isLoading} />
    </View>
  );
}
