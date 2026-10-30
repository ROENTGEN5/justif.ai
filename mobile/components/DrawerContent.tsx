/**
 * Custom Drawer Content
 * Shows chat history, new chat button, theme switcher, user profile, and sign out.
 */

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Alert,
  TextInput,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Colors, ThemeMode } from "../constants/Colors";
import { Strings } from "../constants/Strings";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { getChats, deleteChat, Chat, getProfile, UserProfile } from "../lib/api";

// ─── Helpers ────────────────────────────────────────────────

type GroupedItem =
  | { type: "header"; label: string }
  | { type: "chat"; chat: Chat };

function groupChatsWithHeaders(chats: Chat[]): GroupedItem[] {
  if (chats.length === 0) return [];

  const now = new Date();
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
        result.push({ type: "chat", chat });
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

// ─── Component ──────────────────────────────────────────────

export default function DrawerContent(props: any) {
  const { user, signOut } = useAuth();
  const { mode, theme, setMode } = useTheme();
  const router = useRouter();
  const [chats, setChats] = useState<Chat[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch chats and profile when drawer opens or user/navigation state updates
  useEffect(() => {
    let active = true;
    Promise.all([getChats(), getProfile()])
      .then(([chatsData, profileData]) => {
        if (!active) return;
        setChats(chatsData);
        setProfile(profileData);
      })
      .catch((err) => {
        console.error("Failed to fetch data:", err);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.id, props.state?.index]);

  const handleNewChat = () => {
    router.push("/(main)/chat");
    props.navigation.closeDrawer();
  };

  const handleChatPress = (chatId: string) => {
    router.push(`/(main)/chat/${chatId}`);
    props.navigation.closeDrawer();
  };

  const handleDeleteChat = (chatId: string) => {
    Alert.alert(Strings.deleteChat, Strings.deleteChatConfirm, [
      { text: Strings.cancel, style: "cancel" },
      {
        text: Strings.confirm,
        style: "destructive",
        onPress: async () => {
          try {
            await deleteChat(chatId);
            setChats((prev) => prev.filter((c) => c.id !== chatId));
          } catch {
            Alert.alert("Error", Strings.errorGeneric);
          }
        },
      },
    ]);
  };

  const userDisplayName =
    profile?.full_name || user?.user_metadata?.full_name || user?.email || "User";
  const userEmail = user?.email || "";
  const avatarUrl = profile?.avatar_url;

  const themeOptions: { key: ThemeMode; label: string; icon: string }[] = [
    { key: "light", label: Strings.lightMode, icon: "sunny-outline" },
    { key: "dark", label: Strings.darkMode, icon: "moon-outline" },
    { key: "night", label: Strings.nightMode, icon: "cloudy-night-outline" },
  ];

  const filteredChats = chats.filter((chat) =>
    chat.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
          <Image
            source={require("../assets/logo.png")}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              borderWidth: 2,
              borderColor: theme.logoCircleBorder,
            }}
            contentFit="cover"
          />
          <View>
            <Text
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
              style={{
                fontSize: 11,
                color: theme.drawerHeaderSubtext,
                fontStyle: "italic",
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

      {/* ─── Theme Switcher ────────────────────────────── */}
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 20,
          paddingVertical: 12,
          gap: 6,
          borderBottomWidth: 1,
          borderBottomColor: theme.divider,
        }}
      >
        {themeOptions.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            onPress={() => setMode(opt.key)}
            activeOpacity={0.7}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: mode === opt.key ? theme.accent : theme.surfaceElevated,
              gap: 4,
              borderWidth: 1,
              borderColor: mode === opt.key ? theme.accent : theme.border,
            }}
          >
            <Ionicons
              name={opt.icon as any}
              size={14}
              color={mode === opt.key ? theme.accentText : theme.textSecondary}
            />
            <Text
              style={{
                fontSize: 11,
                fontWeight: mode === opt.key ? "700" : "500",
                color: mode === opt.key ? theme.accentText : theme.textSecondary,
              }}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ─── Chat History ──────────────────────────────── */}
      <View style={{ flex: 1, paddingTop: 12 }}>
        <Text
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
        ) : filteredChats.length === 0 ? (
          <View
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
          </View>
        ) : (
          <FlatList
            data={groupChatsWithHeaders(filteredChats)}
            keyExtractor={(item) =>
              item.type === "header" ? `header-${item.label}` : item.chat.id
            }
            initialNumToRender={10}
            maxToRenderPerBatch={8}
            windowSize={5}
            removeClippedSubviews={Platform.OS === "android"}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
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
                  onPress={() => handleChatPress(chat.id)}
                  onLongPress={() => handleDeleteChat(chat.id)}
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
                      style={{
                        fontSize: 11,
                        color: theme.textTertiary,
                        marginTop: 2,
                      }}
                    >
                      {formatRelativeTime(chat.updated_at)}
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
            }}
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
            props.navigation.closeDrawer();
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
            props.navigation.closeDrawer();
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
              numberOfLines={1}
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: theme.text,
              }}
            >
              {userDisplayName}
            </Text>
            <Text
              numberOfLines={1}
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
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 10,
            borderRadius: 10,
            backgroundColor: theme.surfaceElevated,
            borderWidth: 1,
            borderColor: theme.border,
            gap: 8,
          }}
        >
          <Ionicons name="log-out-outline" size={18} color={Colors.error} />
          <Text
            style={{
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
}
