import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "../../lib/theme";

export default function PrivacyPolicyScreen() {
  const { theme } = useTheme();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Header Bar */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingTop: 54,
          paddingBottom: 16,
          backgroundColor: theme.headerBg,
          borderBottomWidth: 1,
          borderBottomColor: theme.headerBorder,
          gap: 12,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: theme.surfaceElevated,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 18,
              fontWeight: "700",
              color: theme.headerText,
            }}
          >
            Privacy Notice
          </Text>
          <Text
            style={{
              fontSize: 11,
              color: theme.textTertiary,
            }}
          >
            Republic Act No. 10173 (Data Privacy Act of 2012)
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 20,
          paddingBottom: 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Compliance Banner */}
        <View
          style={{
            backgroundColor: theme.surfaceElevated,
            borderRadius: 12,
            padding: 16,
            borderWidth: 1,
            borderColor: theme.accent + "40",
            marginBottom: 20,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Ionicons name="shield-checkmark" size={20} color={theme.accent} />
            <Text style={{ fontSize: 14, fontWeight: "700", color: theme.text }}>
              Commitment to Data Privacy
            </Text>
          </View>
          <Text style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 19 }}>
            Justif.ai operates in strict compliance with Republic Act No. 10173, also known as the
            Data Privacy Act of 2012 (DPA), and follows the Information Security Policy approved by
            Polytechnic University of the Philippines (PUP Unisan Campus).
          </Text>
        </View>

        {/* Section 1 */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: theme.text, marginBottom: 8 }}>
            1. Information We Collect
          </Text>
          <Text style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 20 }}>
            • <Text style={{ fontWeight: "600", color: theme.text }}>Personal Information:</Text> Email address, display name, and avatar profile picture provided upon registration or Google Sign-In.{"\n"}
            • <Text style={{ fontWeight: "600", color: theme.text }}>Chat & Search Data:</Text> Legal inquiry prompts, message histories, and user feedback ratings.{"\n"}
            • <Text style={{ fontWeight: "600", color: theme.text }}>Uploaded Documents & Images:</Text> Contracts, demand letters, or document images submitted voluntarily for legal text extraction and analysis.
          </Text>
        </View>

        {/* Section 2 */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: theme.text, marginBottom: 8 }}>
            2. How We Process and Protect Your Data
          </Text>
          <Text style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 20 }}>
            • <Text style={{ fontWeight: "600", color: theme.text }}>Encryption in Transit & at Rest:</Text> All communications between your device and our servers use TLS/HTTPS encryption. Data is stored in secure cloud infrastructure (Supabase & Pinecone).{"\n"}
            • <Text style={{ fontWeight: "600", color: theme.text }}>Strict User Isolation:</Text> Row-Level Security (RLS) ensures only you can view or interact with your chat history.{"\n"}
            • <Text style={{ fontWeight: "600", color: theme.text }}>No Model Retraining:</Text> Your queries and uploaded documents are not sold to third parties or used to train public commercial AI models.
          </Text>
        </View>

        {/* Section 3 */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: theme.text, marginBottom: 8 }}>
            3. AI Retrieval & DeepSeek Integration
          </Text>
          <Text style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 20 }}>
            Our retrieval engine queries an indexed repository of over 13,900 Philippine statutory laws.
            Prompts are processed using DeepSeek and multimodal vision strictly to generate educational legal analysis.
            {"\n\n"}
            <Text style={{ fontStyle: "italic", color: theme.textTertiary }}>
              ⚖️ Legal Disclaimer: Justif.ai provides educational guidance and does not establish an attorney-client relationship. Always consult a licensed attorney for official legal counsel.
            </Text>
          </Text>
        </View>

        {/* Section 4 */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: theme.text, marginBottom: 8 }}>
            4. Your Rights Under RA 10173
          </Text>
          <Text style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 20 }}>
            As a data subject, you hold the following statutory rights:{"\n"}
            • <Text style={{ fontWeight: "600", color: theme.text }}>Right to Access & Rectify:</Text> View and update your profile details at any time in the Profile screen.{"\n"}
            • <Text style={{ fontWeight: "600", color: theme.text }}>Right to Erasure (Blocking/Deletion):</Text> You have the right to permanently purge your entire chat history or delete your entire user account and all personal data.
          </Text>
        </View>

        {/* Section 5 */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: theme.text, marginBottom: 8 }}>
            5. Contact Information
          </Text>
          <Text style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 20 }}>
            For privacy inquiries, data subject requests, or security concerns, please contact the Justif.ai Development Team:{"\n"}
            • Institution: Polytechnic University of the Philippines — Unisan Campus{"\n"}
            • Email: unisan@pup.edu.ph
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.8}
          style={{
            backgroundColor: theme.accent,
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: "700", color: theme.accentText }}>
            I Understand
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
