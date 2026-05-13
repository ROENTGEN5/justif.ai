/**
 * FilterChips Component
 * Horizontal scrollable chips for filtering by law type.
 */

import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "../constants/Colors";
import { useTheme } from "../lib/theme";

interface FilterChipsProps {
  lawTypes: string[];
  selectedTypes: string[];
  onToggle: (type: string) => void;
  onClear: () => void;
}

const shortLabels: Record<string, string> = {
  "Republic Acts": "Republic Acts",
  "Presidential Decree": "Presidential Decrees",
  "Executive Orders": "Executive Orders",
  "Batas Pambansa": "Batas Pambansa",
  "Administrative Orders": "Admin Orders",
  "Memorandum Orders": "Memo Orders",
  "Presidential Proclamations": "Proclamations",
  "National Administrative Register": "NAR",
  "Memorandum Circulars": "Circulars",
  "Official Gazette": "Official Gazette",
  "Decisions / Signed Resolutions": "Resolutions",
  "1934-35 ConCon": "ConCon",
};

export default function FilterChips({ lawTypes, selectedTypes, onToggle, onClear }: FilterChipsProps) {
  const { theme } = useTheme();
  const hasSelection = selectedTypes.length > 0;

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.background }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6, alignItems: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginRight: 4, gap: 4 }}>
          <Ionicons name="filter" size={14} color={theme.textTertiary} />
          <Text style={{ fontSize: 11, fontWeight: "600", color: theme.textTertiary }}>Filter:</Text>
        </View>
        {hasSelection && (
          <TouchableOpacity onPress={onClear} activeOpacity={0.7} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: Colors.error + "15", borderWidth: 1, borderColor: Colors.error + "30" }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.error }}>✕ Clear</Text>
          </TouchableOpacity>
        )}
        {lawTypes.map((type) => {
          const isSelected = selectedTypes.includes(type);
          return (
            <TouchableOpacity key={type} onPress={() => onToggle(type)} activeOpacity={0.7} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: isSelected ? theme.chipActiveBg : theme.chipBg, borderWidth: 1, borderColor: isSelected ? theme.chipActiveBg : theme.chipBorder }}>
              <Text style={{ fontSize: 11, fontWeight: isSelected ? "700" : "500", color: isSelected ? theme.chipActiveText : theme.chipText }}>{shortLabels[type] || type}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
