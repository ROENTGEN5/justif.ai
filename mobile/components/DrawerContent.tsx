/**
 * Custom Drawer Content
 * Shows chat history, new chat button, theme switcher, user profile, and sign out.
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";
import { DrawerContentScrollView } from "@react-navigation/drawer";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import Colors from "../constants/Colors";
import Strings from "../constants/Strings";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { getChats, deleteChat, Chat } from "../lib/api";
import { ThemeMode } from "../constants/Colors";

export default function DrawerContent(props: any) {
  const { user, signOut } = useAuth();
  const { mode, theme, setMode } = useTheme();
  const router = useRouter();
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch chats when drawer opens
  const fetchChats = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await getChats();
      setChats(data);
    } catch (error) {
      console.error("Failed to fetch chats:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchChats();
    }, [fetchChats])
  );

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
          } catch (error) {
            Alert.alert("Error", Strings.errorGeneric);
          }
        },
      },
    ]);
  };

  const userDisplayName =
    user?.user_metadata?.full_name || user?.email || "User";
  const userEmail = user?.email || "";

  const themeOptions: { key: ThemeMode; label: string; icon: string }[] = [
    { key: "light", label: Strings.lightMode, icon: "sunny-outline" },
    { key: "dark", label: Strings.darkMode, icon: "moon-outline" },
    { key: "night", label: Strings.nightMode, icon: "cloudy-night-outline" },
  ];

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
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: theme.logoCircleBg,
              borderWidth: 2,
              borderColor: theme.logoCircleBorder,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "900",
                color: theme.logoText,
                fontStyle: "italic",
              }}
            >
              J
            </Text>
          </View>
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

        {isLoading ? (
          <View style={{ paddingVertical: 20, alignItems: "center" }}>
            <ActivityIndicator size="small" color={theme.accent} />
          </View>
        ) : chats.length === 0 ? (
          <View
            style={{
              paddingVertical: 30,
              paddingHorizontal: 20,
              alignItems: "center",
            }}
          >
            <Ionicons
              name="chatbubbles-outline"
              size={32}
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
              {Strings.noChats}
            </Text>
          </View>
        ) : (
          <FlatList
            data={chats}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => handleChatPress(item.id)}
                onLongPress={() => handleDeleteChat(item.id)}
                activeOpacity={0.7}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 12,
                  paddingHorizontal: 20,
                  gap: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.divider,
                }}
              >
                <Ionicons
                  name="chatbubble-outline"
                  size={18}
                  color={theme.textTertiary}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 14,
                      fontWeight: "500",
                      color: theme.text,
                    }}
                  >
                    {item.title}
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      color: theme.textTertiary,
                      marginTop: 2,
                    }}
                  >
                    {new Date(item.updated_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
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
        {/* User info */}
        <View
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
            }}
          >
            <Ionicons
              name="person-outline"
              size={18}
              color={theme.textSecondary}
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
        </View>

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
