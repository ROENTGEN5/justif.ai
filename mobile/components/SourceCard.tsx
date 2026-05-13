/**
 * SourceCard Component
 * Displays cited law sources below an AI response.
 */

import React, { useState } from "react";
import { View, Text, TouchableOpacity, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../lib/theme";
import Strings from "../constants/Strings";
import { LawSource } from "../lib/api";

interface SourceCardProps {
  sources: LawSource[];
}

const lawTypeLabels: Record<string, string> = {
  "Republic Acts": "RA",
  "Presidential Decree": "PD",
  "Executive Orders": "EO",
  "Batas Pambansa": "BP",
  "Administrative Orders": "AO",
  "Memorandum Orders": "MO",
  "Presidential Proclamations": "PP",
  "National Administrative Register": "NAR",
  "Memorandum Circulars": "MC",
  "Official Gazette": "OG",
  "Decisions / Signed Resolutions": "SR",
  "1934-35 ConCon": "CC",
};

export default function SourceCard({ sources }: SourceCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { theme } = useTheme();

  if (!sources || sources.length === 0) return null;

  return (
    <View className="items-start px-4 mb-3">
      <View style={{ maxWidth: "82%", backgroundColor: theme.sourceBg, borderRadius: 14, borderWidth: 1, borderColor: theme.sourceBorder, overflow: "hidden" }}>
        <TouchableOpacity onPress={() => setIsExpanded(!isExpanded)} activeOpacity={0.7} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10, backgroundColor: theme.sourceHeaderBg, borderBottomWidth: isExpanded ? 1 : 0, borderBottomColor: theme.sourceBorder }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="book-outline" size={14} color={theme.textSecondary} />
            <Text style={{ fontSize: 12, fontWeight: "700", color: theme.textSecondary, letterSpacing: 0.3 }}>
              {Strings.sources} ({sources.length})
            </Text>
          </View>
          <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={14} color={theme.textTertiary} />
        </TouchableOpacity>

        {isExpanded && (
          <View style={{ padding: 10 }}>
            {sources.map((source, index) => (
              <TouchableOpacity key={index} activeOpacity={0.7} onPress={() => { if (source.url) Linking.openURL(source.url).catch(() => {}); }} style={{ flexDirection: "row", alignItems: "flex-start", paddingVertical: 8, paddingHorizontal: 6, borderBottomWidth: index < sources.length - 1 ? 1 : 0, borderBottomColor: theme.divider, gap: 8 }}>
                <View style={{ backgroundColor: theme.badgeBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, minWidth: 28, alignItems: "center", marginTop: 2 }}>
                  <Text style={{ fontSize: 9, fontWeight: "800", color: theme.badgeText }}>{lawTypeLabels[source.label] || source.label.slice(0, 3).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={2} style={{ fontSize: 12, fontWeight: "600", color: theme.text, lineHeight: 16 }}>{source.short_title || source.full_title || "Untitled Law"}</Text>
                  {source.date && <Text style={{ fontSize: 10, color: theme.textTertiary, marginTop: 2 }}>{source.date}</Text>}
                </View>
                {source.url && <Ionicons name="open-outline" size={12} color={theme.textTertiary} style={{ marginTop: 2 }} />}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
