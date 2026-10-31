import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TextInputProps, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useTheme } from "../lib/theme";

export function AuthScreen({ title, subtitle, children }: {
  title: string; subtitle: string; children: React.ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}>
          <View style={{ width: "100%", maxWidth: 460, alignSelf: "center", gap: 20 }}>
            <View style={{ alignItems: "center", gap: 8 }}>
              <Image source={require("../assets/logo.png")} style={{ width: 72, height: 72, borderRadius: 16 }} contentFit="cover" accessibilityLabel="Justif AI logo" />
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: "800" }}>Justif.ai</Text>
            </View>
            <View style={{ gap: 8 }}>
              <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 28, fontWeight: "800", textAlign: "center" }}>{title}</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 21, textAlign: "center" }}>{subtitle}</Text>
            </View>
            <View style={{ backgroundColor: theme.surfaceElevated, borderColor: theme.border, borderWidth: 1, borderRadius: 20, padding: 20, gap: 16 }}>
              {children}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function AuthField({ label, error, hint, password = false, ...props }: TextInputProps & {
  label: string; error?: string; hint?: string; password?: boolean;
}) {
  const { theme } = useTheme();
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: "600" }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: theme.inputBg, borderRadius: 12, borderWidth: focused ? 2 : 1, borderColor: error ? "#e57373" : focused ? theme.accent : theme.inputBorder, paddingHorizontal: 12 }}>
        <TextInput
          {...props}
          accessibilityLabel={label}
          accessibilityHint={error || hint}
          placeholderTextColor={theme.inputPlaceholder}
          secureTextEntry={password && !visible}
          autoCorrect={false}
          onFocus={(event) => { setFocused(true); props.onFocus?.(event); }}
          onBlur={(event) => { setFocused(false); props.onBlur?.(event); }}
          style={{ flex: 1, minWidth: 0, minHeight: 48, paddingVertical: 12, color: theme.inputText, fontSize: 16 }}
        />
        {password && (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`} onPress={() => setVisible(!visible)} style={{ minHeight: 44, minWidth: 44, justifyContent: "center", alignItems: "center" }}>
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{visible ? "Hide" : "Show"}</Text>
          </TouchableOpacity>
        )}
      </View>
      {(error || hint) && <Text accessibilityLiveRegion={error ? "polite" : "none"} style={{ color: error ? "#e57373" : theme.textSecondary, fontSize: 12, lineHeight: 18 }}>{error || hint}</Text>}
    </View>
  );
}

export function AuthButton({ title, busy, disabled, onPress }: { title: string; busy?: boolean; disabled?: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }} disabled={disabled || busy} onPress={onPress} style={{ minHeight: 48, padding: 14, borderRadius: 12, backgroundColor: theme.accent, opacity: disabled || busy ? 0.6 : 1, justifyContent: "center", alignItems: "center" }}>
      {busy ? <ActivityIndicator color={theme.accentText} /> : <Text style={{ color: theme.accentText, fontSize: 16, fontWeight: "700", textAlign: "center" }}>{title}</Text>}
    </TouchableOpacity>
  );
}

export function AuthNotice({ text }: { text?: string }) {
  const { theme } = useTheme();
  return text ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 21 }}>{text}</Text> : null;
}

export function AuthTextAction({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  const { theme } = useTheme();
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={{ minHeight: 44, justifyContent: "center", paddingVertical: 8 }}><Text style={{ textAlign: "center", color: theme.text, textDecorationLine: "underline", fontSize: 14, fontWeight: "600" }}>{title}</Text></TouchableOpacity>;
}
