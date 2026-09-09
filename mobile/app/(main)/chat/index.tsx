/**
 * New Chat Screen (Default)
 * RAG-powered chat with law type filtering, source citations,
 * and file upload for legal document analysis.
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import Strings from "../../../constants/Strings";
import ChatBubble from "../../../components/ChatBubble";
import ChatInput from "../../../components/ChatInput";
import LoadingDots from "../../../components/LoadingDots";
import SourceCard from "../../../components/SourceCard";
import FilterChips from "../../../components/FilterChips";
import {
  sendMessage,
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
}

export default function NewChatScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const [randomSuggestions] = useState(() => {
    const allSuggestions = [
      "What are my rights as an employee?",
      "How do I file a small claims case?",
      "What is the process for annulment?",
      "What are the requirements for legal separation?",
      "Can my employer fire me without cause?",
      "How do I deal with a bouncing check?",
      "What are the rights of a tenant?",
      "How to file a cyber libel complaint?",
      "What are the rules on overtime pay?",
      "How do I adopt a child legally?",
      "What constitutes sexual harassment in the workplace?",
      "How can I change my legal name?",
      "What is the Anti-Violence Against Women and Their Children Act?"
    ];
    return [...allSuggestions].sort(() => 0.5 - Math.random()).slice(0, 3);
  });

  // Filter state
  const [lawTypes, setLawTypes] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  // Fetch available law types on mount
  useEffect(() => {
    getLawTypes().then(setLawTypes).catch(() => {});
  }, []);

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
          chatId || undefined,
          selectedTypes.length > 0 ? selectedTypes : undefined,
        );

        if (!chatId) {
          setChatId(response.chat_id);
        }

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

  const handleFileSelected = useCallback(
    async (file: FileAttachment) => {
      const userMsg: DisplayMessage = {
        id: `user-file-${Date.now()}`,
        role: "user",
        content: `📎 Uploaded: ${file.name}`,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      try {
        const response = await analyzeFile(
          file,
          chatId || undefined,
        );

        if (!chatId) {
          setChatId(response.chat_id);
        }

        const assistantMsg: DisplayMessage = {
          id: `assistant-file-${Date.now()}`,
          role: "assistant",
          content: response.response,
          created_at: new Date().toISOString(),
          sources: response.sources,
        };

        setMessages((prev) => [...prev, assistantMsg]);
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

  const renderWelcomeHeader = () => {
    if (messages.length > 0) return null;

    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 32,
          paddingVertical: 60,
        }}
      >
        <Image
          source={require("../../../assets/logo.png")}
          style={{
            width: 80,
            height: 80,
            marginBottom: 20,
            borderRadius: 16,
          }}
          resizeMode="cover"
        />

        <Text
          style={{
            fontSize: 22,
            fontWeight: "800",
            color: theme.text,
            textAlign: "center",
            marginBottom: 8,
          }}
        >
          {Strings.welcome}
        </Text>

        <Text
          style={{
            fontSize: 15,
            color: theme.textSecondary,
            textAlign: "center",
            lineHeight: 22,
          }}
        >
          {Strings.chatWelcome}
        </Text>

        {/* Suggestion chips */}
        <View style={{ marginTop: 28, gap: 10, width: "100%" }}>
          {randomSuggestions.map((suggestion, index) => (
            <View
              key={index}
              style={{
                backgroundColor: theme.cardBg,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 12,
                paddingVertical: 12,
                paddingHorizontal: 16,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  color: theme.textSecondary,
                  lineHeight: 18,
                }}
                onPress={() => handleSend(suggestion)}
              >
                {suggestion}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

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

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
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
      {messages.length === 0 ? (
        renderWelcomeHeader()
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingTop: 16,
            paddingBottom: 8,
          }}
          onContentSizeChange={scrollToBottom}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={isLoading ? <LoadingDots /> : null}
        />
      )}

        <ChatInput
          onSend={handleSend}
          onFileSelected={handleFileSelected}
          isLoading={isLoading}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
