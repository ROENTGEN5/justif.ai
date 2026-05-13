/**
 * Register Screen
 * Minimalist registration form with gray/black/white aesthetic.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Link, useRouter } from "expo-router";
import Strings from "../../constants/Strings";
import LogoPlaceholder from "../../components/LogoPlaceholder";
import { useAuth } from "../../lib/auth";
import { useTheme } from "../../lib/theme";

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleRegister = async () => {
    if (!fullName.trim() || !email.trim() || !password) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }

    if (password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match.");
      return;
    }

    setIsLoading(true);
    try {
      await signUp(email, password, fullName);
      Alert.alert("Success!", Strings.successRegister, [
        {
          text: Strings.ok,
          onPress: () => router.replace("/(auth)/login"),
        },
      ]);
    } catch (error: any) {
      Alert.alert("Error", error.message || Strings.errorRegister);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingHorizontal: 24,
            paddingVertical: 40,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ─── Logo Section ────────────────────────── */}
          <View style={{ alignItems: "center", marginBottom: 32 }}>
            <LogoPlaceholder size="medium" showTagline />
          </View>

          {/* ─── Welcome Text ────────────────────────── */}
          <View style={{ marginBottom: 28 }}>
            <Text
              style={{
                fontSize: 26,
                fontWeight: "800",
                color: theme.text,
                textAlign: "center",
              }}
            >
              {Strings.registerTitle}
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: theme.textSecondary,
                textAlign: "center",
                marginTop: 8,
              }}
            >
              {Strings.registerSubtitle}
            </Text>
          </View>

          {/* ─── Form Card ───────────────────────────── */}
          <View
            style={{
              backgroundColor: theme.surfaceElevated,
              borderRadius: 20,
              padding: 24,
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            {/* Full Name */}
            <View style={{ marginBottom: 14 }}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: theme.textSecondary,
                  marginBottom: 8,
                }}
              >
                {Strings.fullName}
              </Text>
              <View
                style={{
                  backgroundColor: theme.inputBg,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: theme.inputBorder,
                  paddingHorizontal: 16,
                  paddingVertical: Platform.OS === "ios" ? 14 : 8,
                }}
              >
                <TextInput
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="John Doe"
                  placeholderTextColor={theme.inputPlaceholder}
                  autoCapitalize="words"
                  autoComplete="name"
                  style={{
                    fontSize: 16,
                    color: theme.inputText,
                  }}
                />
              </View>
            </View>

            {/* Email */}
            <View style={{ marginBottom: 14 }}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: theme.textSecondary,
                  marginBottom: 8,
                }}
              >
                {Strings.email}
              </Text>
              <View
                style={{
                  backgroundColor: theme.inputBg,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: theme.inputBorder,
                  paddingHorizontal: 16,
                  paddingVertical: Platform.OS === "ios" ? 14 : 8,
                }}
              >
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="email@example.com"
                  placeholderTextColor={theme.inputPlaceholder}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  style={{
                    fontSize: 16,
                    color: theme.inputText,
                  }}
                />
              </View>
            </View>

            {/* Password */}
            <View style={{ marginBottom: 14 }}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: theme.textSecondary,
                  marginBottom: 8,
                }}
              >
                {Strings.password}
              </Text>
              <View
                style={{
                  backgroundColor: theme.inputBg,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: theme.inputBorder,
                  paddingHorizontal: 16,
                  paddingVertical: Platform.OS === "ios" ? 14 : 8,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="6+ characters"
                  placeholderTextColor={theme.inputPlaceholder}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  style={{
                    flex: 1,
                    fontSize: 16,
                    color: theme.inputText,
                  }}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Text style={{ color: theme.textTertiary, fontSize: 13 }}>
                    {showPassword ? Strings.hide : Strings.show}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Confirm Password */}
            <View style={{ marginBottom: 24 }}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: theme.textSecondary,
                  marginBottom: 8,
                }}
              >
                {Strings.confirmPassword}
              </Text>
              <View
                style={{
                  backgroundColor: theme.inputBg,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: theme.inputBorder,
                  paddingHorizontal: 16,
                  paddingVertical: Platform.OS === "ios" ? 14 : 8,
                }}
              >
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Repeat password"
                  placeholderTextColor={theme.inputPlaceholder}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  style={{
                    fontSize: 16,
                    color: theme.inputText,
                  }}
                />
              </View>
            </View>

            {/* Register Button */}
            <TouchableOpacity
              onPress={handleRegister}
              disabled={isLoading}
              activeOpacity={0.8}
              style={{
                backgroundColor: theme.accent,
                paddingVertical: 16,
                borderRadius: 14,
                alignItems: "center",
                opacity: isLoading ? 0.7 : 1,
              }}
            >
              {isLoading ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <ActivityIndicator size="small" color={theme.accentText} />
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "700",
                      color: theme.accentText,
                    }}
                  >
                    {Strings.registering}
                  </Text>
                </View>
              ) : (
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "700",
                    color: theme.accentText,
                  }}
                >
                  {Strings.register}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* ─── Login Link ──────────────────────────── */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              marginTop: 24,
              gap: 4,
            }}
          >
            <Text style={{ fontSize: 14, color: theme.textSecondary }}>
              {Strings.hasAccount}
            </Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: theme.text,
                    textDecorationLine: "underline",
                  }}
                >
                  {Strings.login}
                </Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
