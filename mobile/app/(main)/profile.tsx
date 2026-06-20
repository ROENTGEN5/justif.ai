import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../lib/theme";
import {
  getProfile,
  updateProfile,
  uploadAvatar,
  UserProfile,
  deleteAllChats,
} from "../../lib/api";
import Strings from "../../constants/Strings";

export default function ProfileScreen() {
  const { theme } = useTheme();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [fullName, setFullName] = useState("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingChats, setIsDeletingChats] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setIsLoading(true);
    const p = await getProfile();
    if (p) {
      setProfile(p);
      setFullName(p.full_name || "");
      setAvatarUri(p.avatar_url || null);
    }
    setIsLoading(false);
  };

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setAvatarUri(result.assets[0].uri);
      }
    } catch (e: any) {
      Alert.alert("Error picking image", e.message);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      let newAvatarUrl = profile?.avatar_url || null;

      // If the uri changed and it's a local file (starts with file://), upload it
      if (avatarUri && avatarUri.startsWith("file://")) {
        newAvatarUrl = await uploadAvatar(avatarUri);
      }

      await updateProfile(fullName, newAvatarUrl);
      setAvatarUri(newAvatarUrl); // Update local state to public URL
      Alert.alert("Success", "Profile updated successfully!");
    } catch (error: any) {
      Alert.alert("Error", error.message || "Could not save profile.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAllChats = () => {
    Alert.alert(Strings.deleteAllChats, Strings.deleteAllChatsConfirm, [
      { text: Strings.cancel, style: "cancel" },
      {
        text: Strings.confirm,
        style: "destructive",
        onPress: async () => {
          try {
            setIsDeletingChats(true);
            await deleteAllChats();
            Alert.alert("Success", "All conversation history has been deleted.");
          } catch (error: any) {
            Alert.alert("Error", error.message || "Could not delete chat history.");
          } finally {
            setIsDeletingChats(false);
          }
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, padding: 20 }}>
      {/* Avatar Section */}
      <View style={{ alignItems: "center", marginTop: 40, marginBottom: 40 }}>
        <TouchableOpacity
          onPress={handlePickImage}
          activeOpacity={0.8}
          style={{
            width: 120,
            height: 120,
            borderRadius: 60,
            backgroundColor: theme.surfaceElevated,
            borderWidth: 2,
            borderColor: theme.border,
            justifyContent: "center",
            alignItems: "center",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {avatarUri ? (
            <Image
              source={{ uri: avatarUri }}
              style={{ width: "100%", height: "100%" }}
            />
          ) : (
            <Ionicons name="person" size={60} color={theme.textTertiary} />
          )}
          <View
            style={{
              position: "absolute",
              bottom: 0,
              width: "100%",
              backgroundColor: "rgba(0,0,0,0.5)",
              paddingVertical: 4,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "white", fontSize: 10, fontWeight: "600" }}>EDIT</Text>
          </View>
        </TouchableOpacity>
        <Text style={{ marginTop: 12, fontSize: 14, color: theme.textSecondary }}>
          Tap to change profile picture
        </Text>
      </View>

      {/* Details Section */}
      <View style={{ marginBottom: 24 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: theme.textSecondary, marginBottom: 8, marginLeft: 4 }}>
          Full Name
        </Text>
        <TextInput
          value={fullName}
          onChangeText={setFullName}
          placeholder="Enter your name"
          placeholderTextColor={theme.textTertiary}
          style={{
            backgroundColor: theme.surfaceElevated,
            color: theme.text,
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderRadius: 12,
            fontSize: 16,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        />
      </View>

      {/* Save Button */}
      <TouchableOpacity
        onPress={handleSave}
        disabled={isSaving}
        activeOpacity={0.8}
        style={{
          backgroundColor: theme.accent,
          paddingVertical: 16,
          borderRadius: 12,
          alignItems: "center",
          opacity: isSaving ? 0.7 : 1,
        }}
      >
        {isSaving ? (
          <ActivityIndicator color={theme.accentText} />
        ) : (
          <Text style={{ fontSize: 16, fontWeight: "700", color: theme.accentText }}>
            Save Changes
          </Text>
        )}
      </TouchableOpacity>

      {/* Delete All Chat History Button */}
      <TouchableOpacity
        onPress={handleDeleteAllChats}
        disabled={isDeletingChats || isLoading}
        activeOpacity={0.8}
        style={{
          backgroundColor: theme.surfaceElevated,
          paddingVertical: 16,
          borderRadius: 12,
          alignItems: "center",
          marginTop: 16,
          borderWidth: 1,
          borderColor: "red",
          opacity: isDeletingChats ? 0.7 : 1,
        }}
      >
        {isDeletingChats ? (
          <ActivityIndicator color="red" />
        ) : (
          <Text style={{ fontSize: 16, fontWeight: "700", color: "red" }}>
            {Strings.deleteAllChats}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
