/**
 * Login Screen
 * Minimalist auth screen with gray/black/white aesthetic.
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
import { Link } from "expo-router";
import Strings from "../../constants/Strings";
import LogoPlaceholder from "../../components/LogoPlaceholder";
import { useAuth } from "../../lib/auth";
import { useTheme } from "../../lib/theme";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const { theme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
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
            <LogoPlaceholder size="large" showTagline />
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
