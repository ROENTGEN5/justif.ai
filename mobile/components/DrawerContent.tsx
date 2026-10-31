/**
 * Custom Drawer Content
 * Shows chat history, new chat button, theme switcher, user profile, and sign out.
 */

import React, { useEffect, useState, useRef, useMemo, useCallback, memo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
  TextInput,
  Platform,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import BrandLogo from "./BrandLogo";
import { Ionicons } from "@expo/vector-icons";
import type { DrawerContentComponentProps } from "expo-router/drawer";
import { createDrawerUpdates, createDrawerMotion } from "../lib/drawerUpdates";
import { useRouter } from "expo-router";
import { Colors, ThemeMode, ThemeColors } from "../constants/Colors";
import { Strings } from "../constants/Strings";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { getChats, getCachedChats, deleteChat, Chat, getProfile, UserProfile } from "../lib/api";
import { usePullRefresh } from "../hooks/usePullRefresh";
import RefreshNotice from "./RefreshNotice";
import { textFix, singleLine } from "../lib/textFix";

// ─── Helpers ────────────────────────────────────────────────

type GroupedItem =
  | { type: "header"; label: string }
  | { type: "chat"; chat: Chat; timeLabel: string };

function groupChatsWithHeaders(chats: Chat[], day: string): GroupedItem[] {
  if (chats.length === 0) return [];

  const now = new Date(day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const thisWeek = new Date(today);
  thisWeek.setDate(thisWeek.getDate() - 7);
  const thisMonth = new Date(today);
  thisMonth.setDate(thisMonth.getDate() - 30);

  const groups: { label: string; chats: Chat[] }[] = [
    { label: "Today", chats: [] },
    { label: "Yesterday", chats: [] },
    { label: "This Week", chats: [] },
    { label: "This Month", chats: [] },
    { label: "Earlier", chats: [] },
  ];

  for (const chat of chats) {
    const date = new Date(chat.updated_at);
    if (date >= today) {
      groups[0].chats.push(chat);
    } else if (date >= yesterday) {
      groups[1].chats.push(chat);
    } else if (date >= thisWeek) {
      groups[2].chats.push(chat);
    } else if (date >= thisMonth) {
      groups[3].chats.push(chat);
    } else {
      groups[4].chats.push(chat);
    }
  }

  const result: GroupedItem[] = [];
  for (const group of groups) {
    if (group.chats.length > 0) {
      result.push({ type: "header", label: group.label });
      for (const chat of group.chats) {
        result.push({ type: "chat", chat, timeLabel: formatRelativeTime(chat.updated_at) });
      }
    }
  }

  return result;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date >= today) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } else if (date >= yesterday) {
    return "Yesterday";
  } else {
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }
}

const HistoryRow = memo(function HistoryRow({ item, theme, onSelect, onDelete }: {
  item: GroupedItem; theme: ThemeColors; onSelect: (id: string) => void; onDelete: (id: string) => void;
}) {
  if (item.type === "header") {
    return (
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 6,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: "800",
            color: theme.accent,
            letterSpacing: 0.8,
            textTransform: "uppercase",
          }}
        >
          {item.label}
        </Text>
      </View>
    );
  }

  const chat = item.chat;
  const isFileChat = chat.title.startsWith("📎");

  return (
    <TouchableOpacity
      onPress={() => onSelect(chat.id)}
      onLongPress={() => onDelete(chat.id)}
      activeOpacity={0.7}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 11,
        paddingHorizontal: 20,
        gap: 12,
        borderBottomWidth: 1,
        borderBottomColor: theme.divider,
      }}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          backgroundColor: theme.surfaceElevated,
          justifyContent: "center",
          alignItems: "center",
          borderWidth: 1,
          borderColor: theme.border,
        }}
      >
        <Ionicons
          name={isFileChat ? "document-text-outline" : "chatbubble-outline"}
          size={15}
          color={theme.textTertiary}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          {...textFix}
          numberOfLines={1}
          style={{
            fontSize: 14,
            fontWeight: "600",
            color: theme.text,
          }}
        >
          {chat.title}
        </Text>
        <Text
          {...singleLine}
          style={{
            fontSize: 11,
            color: theme.textTertiary,
            marginTop: 2,
          }}
        >
          {item.timeLabel}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={14}
        color={theme.textTertiary}
        style={{ opacity: 0.5 }}
      />
    </TouchableOpacity>
  );
});
const historyKey = (item: GroupedItem) => item.type === "header" ? `header-${item.label}` : item.chat.id;
const historyContainer = { flexGrow: 1 };

// ─── Component ──────────────────────────────────────────────

const DrawerContent = memo(function DrawerContent({ navigation, motion }: Pick<DrawerContentComponentProps, "navigation"> & { motion: ReturnType<typeof createDrawerMotion> }) {
  const { fontScale } = useWindowDimensions();
  const { user, signOut } = useAuth();
  const { mode, theme, setMode } = useTheme();
  const router = useRouter();
  const [chats, setChats] = useState<Chat[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const loadingHistory = useRef(false);
  const deletingChat = useRef(false);
  const loadGeneration = useRef(0);
  const updates = useRef<ReturnType<typeof createDrawerUpdates> | null>(null);
  const [historyDay, setHistoryDay] = useState(() => new Date().toDateString());
  const applyChats = useCallback((next: Chat[]) => {
    setHistoryDay(new Date().toDateString());
    setChats(previous => previous.length === next.length && previous.every((chat, i) =>
      chat.id === next[i].id && chat.title === next[i].title && chat.updated_at === next[i].updated_at && chat.created_at === next[i].created_at
    ) ? previous : next);
  }, []);
  const { refreshing, refreshError, onRefresh, cancelRefresh } = usePullRefresh(user?.id, {
    blocked: () => loadingHistory.current || deletingChat.current || !!updates.current?.isPaused(),
    load: () => getChats({ allowCacheFallback: false }),
    apply: data => {
      const generation = loadGeneration.current;
      updates.current?.run("history", () => { if (generation === loadGeneration.current) applyChats(data); });
    },
  });

  // Read/render history after the actual opening transition, not during its slide.
  // The same gate queues responses arriving during a later close or swipe.
  useEffect(() => {
    let active = true;
    const gate = createDrawerUpdates();
    if (motion.isMoving()) gate.pause();
    updates.current = gate;
    const load = async () => {
      if (!user?.id || loadingHistory.current || deletingChat.current) return;
      loadingHistory.current = true;
      const generation = ++loadGeneration.current;
      const valid = () => active && generation === loadGeneration.current;
      try {
        const cached = await getCachedChats().catch(() => []);
        if (valid() && cached.length) gate.run("history", () => {
          if (valid()) { applyChats(cached); setIsLoading(false); }
        });
        const [history, account] = await Promise.allSettled([getChats(), getProfile()]);
        if (!valid()) return;
        gate.run("history", () => {
          if (!valid()) return;
          if (history.status === "fulfilled") applyChats(history.value);
          if (account.status === "fulfilled") setProfile(account.value);
          setIsLoading(false);
        });
      } finally {
        if (valid()) loadingHistory.current = false;
      }
    };
    const generationRef = loadGeneration;
    const unsubscribe = motion.subscribe({
      start: () => gate.pause(),
      end: closing => {
        gate.resume();
        if (!closing) void load();
      },
    });
    if (motion.isOpen() && !motion.isMoving()) void load();
    return () => {
      active = false;
      generationRef.current++;
      loadingHistory.current = false;
      unsubscribe();
      gate.dispose();
      if (updates.current === gate) updates.current = null;
    };
  }, [user?.id, motion, applyChats]);

  const handleNewChat = useCallback(() => {
    router.push("/(main)/chat");
    navigation.closeDrawer();
  }, [router, navigation]);

  const handleChatPress = useCallback((chatId: string) => {
    router.push(`/(main)/chat/${chatId}`);
    navigation.closeDrawer();
  }, [router, navigation]);

  const handleDeleteChat = useCallback((chatId: string) => {
    Alert.alert(Strings.deleteChat, Strings.deleteChatConfirm, [
      { text: Strings.cancel, style: "cancel" },
      {
        text: Strings.confirm,
        style: "destructive",
        onPress: async () => {
          cancelRefresh();
          loadGeneration.current++;
          loadingHistory.current = false;
          deletingChat.current = true;
          try {
            await deleteChat(chatId);
            setChats((prev) => prev.filter((c) => c.id !== chatId));
          } catch {
            Alert.alert("Error", Strings.errorGeneric);
          } finally {
            deletingChat.current = false;
          }
        },
      },
    ]);
  }, [cancelRefresh]);

  const renderHistoryItem = useCallback(({ item }: { item: GroupedItem }) => (
    <HistoryRow item={item} theme={theme} onSelect={handleChatPress} onDelete={handleDeleteChat} />
  ), [theme, handleChatPress, handleDeleteChat]);

  const userDisplayName =
    profile?.full_name || user?.user_metadata?.full_name || user?.email || "User";
  const userEmail = user?.email || "";
  const avatarUrl = profile?.avatar_url;

  const themeOptions: { key: ThemeMode; label: string; icon: string }[] = [
    { key: "light", label: Strings.lightMode, icon: "sunny-outline" },
    { key: "dark", label: Strings.darkMode, icon: "moon-outline" },
    { key: "night", label: Strings.nightMode, icon: "cloudy-night-outline" },
  ];

  const groupedHistory = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return groupChatsWithHeaders(chats.filter(chat => chat.title.toLowerCase().includes(query)), historyDay);
  }, [chats, searchQuery, historyDay]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.drawerBg }}>
      {/* ─── Header ────────────────────────────────────── */}
      <View
        style={{
          paddingTop: 60,
          paddingBottom: 20,
          paddingHorizontal: 20,
          backgroundColor: theme.drawerHeaderBg,
        }}
      >
        {/* Logo & Brand */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <BrandLogo size={48} />
          <View style={{ flex: 1 }}>
            <Text
              {...textFix}
              style={{
                fontSize: 18,
                fontWeight: "800",
                color: theme.drawerHeaderText,
                letterSpacing: 0.5,
              }}
            >
              Justif.ai
            </Text>
            <Text
              {...textFix}
              style={{
                fontSize: 11,
                color: theme.drawerHeaderSubtext,
                fontStyle: "italic",
                paddingRight: 2, // room for the italic overhang of the last glyph
              }}
            >
              {Strings.tagline}
            </Text>
          </View>
        </View>

        {/* New Chat Button */}
        <TouchableOpacity
          onPress={handleNewChat}
          activeOpacity={0.8}
          style={{
            marginTop: 20,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.accent,
            paddingVertical: 12,
            paddingHorizontal: 20,
            borderRadius: 12,
            gap: 8,
          }}
        >
          <Ionicons name="add-circle-outline" size={20} color={theme.accentText} />
          <Text
            {...singleLine}
            style={{
              fontSize: 15,
              fontWeight: "700",
              color: theme.accentText,
            }}
          >
            {Strings.newChat}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ─── Theme Switcher (segmented control) ────────── */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: theme.divider,
        }}
      >
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={Strings.appearance}
          style={{
            flexDirection: "row",
            padding: 3,
            flexWrap: "wrap",
            gap: 3,
            borderRadius: 12,
            backgroundColor: theme.surfaceElevated,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          {themeOptions.map((opt) => {
            const selected = mode === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                onPress={() => setMode(opt.key)}
                activeOpacity={0.7}
                accessibilityRole="radio"
                accessibilityLabel={`${opt.label} theme`}
                accessibilityState={{ selected }}
                style={{
                  flexGrow: 1,
                  flexBasis: 76 * fontScale,
                  minWidth: 76 * fontScale,
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 7,
                  paddingHorizontal: 4,
                  borderRadius: 9,
                  backgroundColor: selected ? theme.accent : "transparent",
                  gap: 5,
                }}
              >
                <Ionicons
                  name={opt.icon as any}
                  size={14}
                  color={selected ? theme.accentText : theme.textSecondary}
                />
                <Text
                  {...textFix}
                  style={{
                    alignSelf: "stretch",
                    paddingHorizontal: 2,
                    textAlign: "center",
                    fontSize: 12,
                    fontWeight: selected ? "700" : "500",
                    color: selected ? theme.accentText : theme.textSecondary,
                  }}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ─── Chat History ──────────────────────────────── */}
      <View style={{ flex: 1, paddingTop: 12 }}>
        <Text
          {...textFix}
          style={{
            paddingHorizontal: 20,
            paddingBottom: 8,
            fontSize: 12,
            fontWeight: "700",
            color: theme.textTertiary,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          {Strings.chatHistory}
        </Text>

        {/* Search Bar */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: theme.surfaceElevated,
            borderRadius: 8,
            paddingHorizontal: 10,
            borderWidth: 1,
            borderColor: theme.border,
          }}>
            <Ionicons name="search" size={16} color={theme.textTertiary} />
            <TextInput
              style={{
                flex: 1,
                paddingVertical: 8,
                paddingHorizontal: 8,
                fontSize: 13,
                color: theme.text,
              }}
              placeholder="Search conversations..."
              placeholderTextColor={theme.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery("")}
                accessibilityRole="button"
                accessibilityLabel="Clear conversation search"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={16} color={theme.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <RefreshNotice message={refreshError} />
        {isLoading ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 14 }}>
            {[0.75, 0.55, 0.85, 0.65].map((widthRatio, idx) => (
              <View
                key={idx}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  opacity: 0.5,
                }}
              >
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    backgroundColor: theme.surfaceElevated,
                    borderWidth: 1,
                    borderColor: theme.border,
                  }}
                />
                <View style={{ flex: 1, gap: 6 }}>
                  <View
                    style={{
                      height: 11,
                      width: `${Math.round(widthRatio * 100)}%`,
                      backgroundColor: theme.border,
                      borderRadius: 5,
                    }}
                  />
                  <View
                    style={{
                      height: 8,
                      width: "35%",
                      backgroundColor: theme.border,
                      borderRadius: 4,
                    }}
                  />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <FlatList
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.accent]} tintColor={theme.accent} progressBackgroundColor={theme.surfaceElevated} />}
            alwaysBounceVertical
            contentContainerStyle={historyContainer}
            ListEmptyComponent={<View
            style={{
              paddingVertical: 30,
              paddingHorizontal: 20,
              alignItems: "center",
            }}
          >
            <Ionicons
              name={searchQuery.trim().length > 0 ? "search-outline" : "chatbubbles-outline"}
              size={30}
              color={theme.textTertiary}
            />
            <Text
              style={{
                fontSize: 13,
                color: theme.textTertiary,
                marginTop: 8,
                textAlign: "center",
              }}
            >
              {searchQuery.trim().length > 0
                ? `No conversations matching "${searchQuery.trim()}"`
                : Strings.noChats}
            </Text>
            {searchQuery.trim().length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery("")}
                activeOpacity={0.7}
                style={{
                  marginTop: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 6,
                  borderRadius: 14,
                  backgroundColor: theme.surfaceElevated,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: theme.text,
                  }}
                >
                  Clear search
                </Text>
              </TouchableOpacity>
            )}
          </View>}
            data={groupedHistory}
            keyExtractor={historyKey}
            initialNumToRender={10}
            maxToRenderPerBatch={8}
            windowSize={5}
            removeClippedSubviews={Platform.OS === "android"}
            showsVerticalScrollIndicator={false}
            renderItem={renderHistoryItem}
          />
        )}
      </View>

      {/* ─── User Profile & Sign Out ──────────────────── */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: theme.divider,
          paddingVertical: 16,
          paddingHorizontal: 20,
        }}
      >
        {/* Privacy Notice Link */}
        <TouchableOpacity
          onPress={() => {
            router.push("/(main)/privacy" as any);
            navigation.closeDrawer();
          }}
          activeOpacity={0.7}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 10,
            backgroundColor: theme.surfaceElevated,
            borderWidth: 1,
            borderColor: theme.border,
            gap: 10,
            marginBottom: 12,
          }}
        >
          <Ionicons name="shield-checkmark-outline" size={18} color={theme.textSecondary} />
          <Text
            {...singleLine}
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: "500",
              color: theme.textSecondary,
            }}
          >
            Privacy Notice (RA 10173)
          </Text>
          <Ionicons name="chevron-forward" size={14} color={theme.textTertiary} />
        </TouchableOpacity>

        {/* User info */}
        <TouchableOpacity
          onPress={() => {
            router.push("/(main)/profile");
            navigation.closeDrawer();
          }}
          activeOpacity={0.7}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: theme.surfaceElevated,
              justifyContent: "center",
              alignItems: "center",
              borderWidth: 1,
              borderColor: theme.border,
              overflow: "hidden",
            }}
          >
            {avatarUrl ? (
              <Image
                key={avatarUrl}
                source={{ uri: avatarUrl }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
              />
            ) : (
              <Ionicons
                name="person-outline"
                size={18}
                color={theme.textSecondary}
              />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text
              {...singleLine}
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: theme.text,
              }}
            >
              {userDisplayName}
            </Text>
            <Text
              {...singleLine}
              style={{
                fontSize: 11,
                color: theme.textTertiary,
              }}
            >
              {userEmail}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Sign Out Button */}
        <TouchableOpacity
          onPress={signOut}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={Strings.signOut}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderRadius: 10,
            backgroundColor: Colors.error + "12",
            borderWidth: 1,
            borderColor: Colors.error + "33",
            gap: 8,
          }}
        >
          <Ionicons name="log-out-outline" size={18} color={Colors.error} />
          <Text
            {...singleLine}
            style={{
              flexShrink: 1,
              fontSize: 14,
              fontWeight: "600",
              color: Colors.error,
            }}
          >
            {Strings.signOut}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

export default DrawerContent;
