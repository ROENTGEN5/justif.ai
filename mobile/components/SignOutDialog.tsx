import React from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../lib/theme";
import BrandLogo from "./BrandLogo";

export default function SignOutDialog({ visible, busy, error, onCancel, onConfirm }: {
  visible: boolean; busy: boolean; error: string; onCancel: () => void; onConfirm: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!busy) onCancel(); }}>
      <View style={{ flex: 1, backgroundColor: "rgba(0, 0, 0, 0.65)" }}>
        <SafeAreaView style={{ flex: 1 }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}>
            <View accessibilityViewIsModal accessibilityLabel="Sign out confirmation" style={{ width: "100%", maxWidth: 400, alignSelf: "center", borderRadius: 28, padding: 24, gap: 20, backgroundColor: theme.cardBg, borderWidth: 1, borderColor: theme.border }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <BrandLogo size={56} />
                <View style={{ backgroundColor: theme.surfaceElevated, borderRadius: 24, padding: 12 }}><Ionicons name="log-out-outline" size={24} color={theme.textSecondary} /></View>
              </View>
              <View style={{ gap: 10 }}>
                <Text accessibilityRole="header" style={{ color: theme.text, fontWeight: "800", fontSize: 25 }}>Sign out of Justif.ai?</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 15, lineHeight: 23 }}>You can sign back in anytime to continue your conversations.</Text>
              </View>
              {!!error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: theme.text, fontSize: 14, lineHeight: 21 }}>{error}</Text>}
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={onConfirm} style={({ pressed }) => ({ minHeight: 52, borderRadius: 14, padding: 14, justifyContent: "center", alignItems: "center", backgroundColor: theme.accent, opacity: busy || pressed ? 0.65 : 1 })}>
                {busy ? <ActivityIndicator color={theme.accentText} /> : <Text style={{ color: theme.accentText, fontSize: 16, fontWeight: "700" }}>Sign out</Text>}
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={onCancel} style={({ pressed }) => ({ minHeight: 48, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center", opacity: busy || pressed ? 0.5 : 1 })}>
                <Text style={{ color: theme.text, fontSize: 15, fontWeight: "600" }}>Stay signed in</Text>
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
