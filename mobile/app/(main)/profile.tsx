import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "../../lib/theme";
import { useAuth } from "../../lib/auth";
import {
  getProfile,
  updateProfile,
  uploadAvatar,
  UserProfile,
  deleteAllChats,
  deleteUserAccount,
} from "../../lib/api";
import { pickImageFromGallery, NormalizedImageAsset } from "../../lib/mediaPicker";
import Strings from "../../constants/Strings";

export default function ProfileScreen() {
  const { theme } = useTheme();
  const { signOut } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [fullName, setFullName] = useState("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [pickedAvatarAsset, setPickedAvatarAsset] = useState<NormalizedImageAsset | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingChats, setIsDeletingChats] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

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
      setPickedAvatarAsset(null);
    }
    setIsLoading(false);
  };

  const handlePickImage = async () => {
    try {
      const normalized = await pickImageFromGallery({
        allowsEditing: true,
        aspect: [1, 1],
        maxDimension: 1024,
        quality: 0.8,
      });

      // User cancellation returns null — handle silently without throwing an error
      if (!normalized) {
        return;
      }

      setPickedAvatarAsset(normalized);
      setAvatarUri(normalized.uri);
    } catch (e: any) {
      console.warn("Profile image selection error:", e);
      Alert.alert(
        "Could Not Select Image",
        e?.message || "Unable to select the image. Please try another photo.",
      );
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      let newAvatarUrl = profile?.avatar_url || null;

      // Upload if the user selected a new local image
      const isLocalUri =
        avatarUri &&
        (avatarUri.startsWith("file://") || avatarUri.startsWith("content://"));

      if (pickedAvatarAsset) {
        newAvatarUrl = await uploadAvatar(
          pickedAvatarAsset.uri,
          pickedAvatarAsset.base64,
        );
      } else if (isLocalUri && avatarUri) {
        newAvatarUrl = await uploadAvatar(avatarUri);
      }

      await updateProfile(fullName, newAvatarUrl);
      setProfile((prev) => (prev ? { ...prev, full_name: fullName, avatar_url: newAvatarUrl } : prev));
      setAvatarUri(newAvatarUrl);
      setPickedAvatarAsset(null);
      Alert.alert("Success", "Profile updated successfully!");
    } catch (error: any) {
      Alert.alert("Error", error.message || "Could not save profile.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to permanently delete your account? All your chat histories, profile information, and uploaded documents will be permanently purged in compliance with RA 10173 (Data Privacy Act of 2012). This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Permanently",
          style: "destructive",
          onPress: async () => {
            try {
              setIsDeletingAccount(true);
              await deleteUserAccount();
              await signOut();
              Alert.alert("Account Deleted", "Your account and all associated personal data have been completely deleted.");
            } catch (error: any) {
              Alert.alert("Error", error.message || "Failed to delete account. Please try again.");
              setIsDeletingAccount(false);
            }
          },
        },
      ]
    );
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
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
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
        disabled={isDeletingChats || isDeletingAccount || isLoading}
        activeOpacity={0.8}
        style={{
          backgroundColor: theme.surfaceElevated,
          paddingVertical: 14,
          borderRadius: 12,
          alignItems: "center",
          marginTop: 16,
          borderWidth: 1,
          borderColor: "#E53E3E",
          opacity: isDeletingChats ? 0.7 : 1,
        }}
      >
        {isDeletingChats ? (
          <ActivityIndicator color="#E53E3E" />
        ) : (
          <Text style={{ fontSize: 15, fontWeight: "600", color: "#E53E3E" }}>
            {Strings.deleteAllChats}
          </Text>
        )}
      </TouchableOpacity>

      {/* Privacy Notice Link */}
      <TouchableOpacity
        onPress={() => router.push("/(main)/privacy" as any)}
        activeOpacity={0.8}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 20,
          paddingVertical: 8,
          gap: 6,
        }}
      >
        <Ionicons name="shield-checkmark-outline" size={16} color={theme.textTertiary} />
        <Text style={{ fontSize: 13, color: theme.textSecondary, fontWeight: "500" }}>
          Read Privacy Notice (RA 10173)
        </Text>
      </TouchableOpacity>

      {/* Delete Account Button (RA 10173 Right to Erasure) */}
      <TouchableOpacity
        onPress={handleDeleteAccount}
        disabled={isDeletingAccount || isDeletingChats || isLoading}
        activeOpacity={0.8}
        style={{
          paddingVertical: 14,
          borderRadius: 12,
          alignItems: "center",
          marginTop: 8,
          opacity: isDeletingAccount ? 0.7 : 1,
        }}
      >
        {isDeletingAccount ? (
          <ActivityIndicator color="#E53E3E" />
        ) : (
          <Text style={{ fontSize: 13, fontWeight: "600", color: "#E53E3E" }}>
            Delete Account & Personal Data
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}
