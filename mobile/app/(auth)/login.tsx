/**
 * Login Screen
 * Minimalist auth screen with gray/black/white aesthetic.
 * Supports email/password and Google Sign-In.
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
  Image,
} from "react-native";
import { Link } from "expo-router";
import Strings from "../../constants/Strings";
import { useAuth } from "../../lib/auth";
import { useTheme } from "../../lib/theme";

export default function LoginScreen() {
  const { signIn, signInWithGoogle } = useAuth();
  const { theme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Error", "Please fill in your email and password.");
      return;
    }

    setIsLoading(true);
    try {
      await signIn(email, password);
    } catch (error: any) {
      Alert.alert("Error", error.message || Strings.errorAuth);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (error: any) {
      Alert.alert("Error", error.message || Strings.googleSignInError);
    } finally {
      setIsGoogleLoading(false);
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
            paddingBottom: 40,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ─── Logo Section ────────────────────────── */}
          <View style={{ alignItems: "center", marginBottom: 40 }}>
            <Image
              source={require("../../assets/logo.png")}
              style={{
                width: 100,
                height: 100,
                borderRadius: 20,
                marginBottom: 12,
              }}
              resizeMode="cover"
            />
            <Text
              style={{
                fontSize: 16,
                fontWeight: "800",
                color: theme.text,
                letterSpacing: 0.5,
              }}
            >
              Justif.ai
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: theme.textSecondary,
                fontStyle: "italic",
                marginTop: 4,
              }}
            >
              {Strings.tagline}
            </Text>
          </View>

          {/* ─── Welcome Text ────────────────────────── */}
          <View style={{ marginBottom: 32 }}>
            <Text
              style={{
                fontSize: 28,
                fontWeight: "800",
                color: theme.text,
                textAlign: "center",
              }}
            >
              {Strings.loginTitle}
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: theme.textSecondary,
                textAlign: "center",
                marginTop: 8,
              }}
            >
              {Strings.loginSubtitle}
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
            {/* Email */}
            <View style={{ marginBottom: 16 }}>
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
            <View style={{ marginBottom: 24 }}>
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
                  placeholder="••••••••"
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

            {/* Sign In Button */}
            <TouchableOpacity
              onPress={handleLogin}
              disabled={isLoading || isGoogleLoading}
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
                    {Strings.signingIn}
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
                  {Strings.login}
                </Text>
              )}
            </TouchableOpacity>

            {/* ─── Divider ─────────────────────────────── */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginVertical: 20,
              }}
            >
              <View
                style={{
                  flex: 1,
                  height: 1,
                  backgroundColor: theme.border,
                }}
              />
              <Text
                style={{
                  marginHorizontal: 12,
                  fontSize: 12,
                  color: theme.textTertiary,
                  fontWeight: "500",
                }}
              >
                {Strings.orContinueWith}
              </Text>
              <View
                style={{
                  flex: 1,
                  height: 1,
                  backgroundColor: theme.border,
                }}
              />
            </View>

            {/* ─── Google Sign-In Button ────────────────── */}
            <TouchableOpacity
              onPress={handleGoogleSignIn}
              disabled={isLoading || isGoogleLoading}
              activeOpacity={0.8}
              style={{
                backgroundColor: theme.inputBg,
                paddingVertical: 14,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 10,
                borderWidth: 1,
                borderColor: theme.inputBorder,
                opacity: isGoogleLoading ? 0.7 : 1,
              }}
            >
              {isGoogleLoading ? (
                <ActivityIndicator size="small" color={theme.textSecondary} />
              ) : (
                <>
                  <Image
                    source={{ uri: "https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" }}
                    style={{ width: 20, height: 20 }}
                    resizeMode="contain"
                  />
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "600",
                      color: theme.text,
                    }}
                  >
                    {Strings.googleSignIn}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* ─── Register Link ───────────────────────── */}
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
              {Strings.noAccount}
            </Text>
            <Link href="/(auth)/register" asChild>
              <TouchableOpacity>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: theme.text,
                    textDecorationLine: "underline",
                  }}
                >
                  {Strings.register}
                </Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
