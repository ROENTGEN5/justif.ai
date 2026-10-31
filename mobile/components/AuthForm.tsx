import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TextInputProps, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import BrandLogo from "./BrandLogo";
import { useTheme } from "../lib/theme";

export function AuthScreen({ title, subtitle, children, footer }: {
  title: string; subtitle: string; children: React.ReactNode; footer?: React.ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 20, paddingVertical: 32 }}>
          <View style={{ width: "100%", maxWidth: 460, alignSelf: "center", gap: 24 }}>
            <View style={{ alignItems: "center", gap: 12 }}>
              <BrandLogo size={104} />
              <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: "700", letterSpacing: 2 }}>PHILIPPINE LEGAL ASSISTANT</Text>
            </View>
            <View style={{ gap: 8 }}>
              <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 30, fontWeight: "800", textAlign: "center" }}>{title}</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 21, textAlign: "center" }}>{subtitle}</Text>
            </View>
            <View style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1, borderRadius: 24, padding: 20, gap: 18 }}>
              {children}
            </View>
            {footer && <View style={{ gap: 2 }}>{footer}</View>}
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
      <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600" }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: theme.inputBg, borderRadius: 14, borderWidth: 1.5, borderColor: error ? "#e57373" : focused ? "#4AA8AE" : theme.inputBorder, paddingHorizontal: 12 }}>
        <Ionicons name={password ? "lock-closed-outline" : props.keyboardType === "email-address" ? "mail-outline" : "person-outline"} size={18} color={focused ? theme.text : theme.textSecondary} style={{ marginRight: 10 }} />
        <TextInput
          {...props}
          accessibilityLabel={label}
          accessibilityHint={error || hint}
          placeholderTextColor={theme.inputPlaceholder}
          secureTextEntry={password && !visible}
          autoCorrect={false}
          onFocus={(event) => { setFocused(true); props.onFocus?.(event); }}
          onBlur={(event) => { setFocused(false); props.onBlur?.(event); }}
          style={{ flex: 1, minWidth: 0, minHeight: 52, paddingVertical: 14, color: theme.inputText, fontSize: 16 }}
        />
        {password && (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`} disabled={props.editable === false} onPress={() => setVisible(!visible)} style={{ minHeight: 44, minWidth: 44, justifyContent: "center", alignItems: "center" }}>
            <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={21} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
      {(error || hint) && <Text accessibilityLiveRegion={error ? "polite" : "none"} style={{ color: error ? "#e57373" : theme.textSecondary, fontSize: 12, lineHeight: 18 }}>{error || hint}</Text>}
    </View>
  );
}

export function AuthButton({ title, busy, disabled, onPress }: { title: string; busy?: boolean; disabled?: boolean; onPress: () => void }) {
  const { mode } = useTheme();
  const buttonColor = mode === "light" ? "#205A7D" : "#91D8D5";
  const labelColor = mode === "light" ? "#FFFFFF" : "#102D38";
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }} disabled={disabled || busy} onPress={onPress} style={{ minHeight: 54, padding: 16, borderRadius: 14, backgroundColor: buttonColor, opacity: disabled || busy ? 0.6 : 1, justifyContent: "center", alignItems: "center" }}>
      {busy ? <ActivityIndicator color={labelColor} /> : <Text style={{ color: labelColor, fontSize: 16, fontWeight: "700", textAlign: "center" }}>{title}</Text>}
    </TouchableOpacity>
  );
}

export function AuthNotice({ text }: { text?: string }) {
  const { theme } = useTheme();
  return text ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 21 }}>{text}</Text> : null;
}

export function AuthTextAction({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  const { theme } = useTheme();
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={{ minHeight: 44, justifyContent: "center", paddingVertical: 8, opacity: disabled ? 0.45 : 1 }}><Text style={{ textAlign: "center", color: theme.text, fontSize: 14, fontWeight: "600" }}>{title}</Text></TouchableOpacity>;
}
