/**
 * FilterChips Component
 * Collapsible bar with horizontal scrollable chips for filtering by law type.
 */

import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors } from "../constants/Colors";
import { useTheme } from "../lib/theme";
import { singleLine } from "../lib/textFix";

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

function FilterChips({ lawTypes, selectedTypes, onToggle, onClear }: FilterChipsProps) {
  const { theme } = useTheme();
  const hasSelection = selectedTypes.length > 0;
  // Collapsed by default to keep the chat viewport clean; the row stays
  // visible (with a count badge) so active filters are never hidden.
  const [expanded, setExpanded] = useState(false);

  const handleToggle = (type: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onToggle(type);
  };

  const handleClear = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onClear();
  };

  const handleExpand = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setExpanded((prev) => !prev);
  };

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.background }}>
      {/* Collapsed header row */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 6, gap: 8 }}>
        <TouchableOpacity
          onPress={handleExpand}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${expanded ? "Hide" : "Show"} law type filters${hasSelection ? `, ${selectedTypes.length} active` : ""}`}
          accessibilityState={{ expanded }}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4, paddingRight: 6, minHeight: 32 }}
        >
          <Ionicons name="options-outline" size={15} color={hasSelection ? theme.text : theme.textSecondary} />
          <Text {...singleLine} style={{ fontSize: 12, fontWeight: "600", color: hasSelection ? theme.text : theme.textSecondary }}>
            Filter laws
          </Text>
          {hasSelection && (
            <View style={{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: theme.chipActiveBg, alignItems: "center", justifyContent: "center" }}>
              <Text {...singleLine} style={{ fontSize: 10, fontWeight: "700", color: theme.chipActiveText }}>
                {selectedTypes.length}
              </Text>
            </View>
          )}
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color={theme.textTertiary} />
        </TouchableOpacity>

        {!expanded && hasSelection && (
          <Text {...singleLine} style={{ flex: 1, fontSize: 11, color: theme.textTertiary }}>
            {selectedTypes.map((t) => shortLabels[t] || t).join(", ")}
          </Text>
        )}
        {(expanded || !hasSelection) && <View style={{ flex: 1 }} />}

        {hasSelection && (
          <TouchableOpacity
            onPress={handleClear}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Clear all law type filters"
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={{ paddingHorizontal: 10, paddingVertical: 5, justifyContent: "center", borderRadius: 14, backgroundColor: Colors.error + "15", borderWidth: 1, borderColor: Colors.error + "30" }}
          >
            <Text {...singleLine} style={{ fontSize: 11, fontWeight: "600", color: Colors.error }}>✕ Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Expanded chip row */}
      {expanded && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 10, gap: 6, alignItems: "center" }}>
          {lawTypes.map((type) => {
            const isSelected = selectedTypes.includes(type);
            const label = shortLabels[type] || type;
            return (
              <TouchableOpacity
                key={type}
                onPress={() => handleToggle(type)}
                activeOpacity={0.7}
                accessibilityRole="checkbox"
                accessibilityLabel={`Filter by ${label}`}
                accessibilityState={{ checked: isSelected }}
                style={{ paddingHorizontal: 14, paddingVertical: 7, justifyContent: "center", borderRadius: 16, backgroundColor: isSelected ? theme.chipActiveBg : theme.chipBg, borderWidth: 1, borderColor: isSelected ? theme.chipActiveBg : theme.chipBorder }}
              >
                <Text {...singleLine} style={{ fontSize: 12, fontWeight: isSelected ? "700" : "500", color: isSelected ? theme.chipActiveText : theme.chipText }}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

export default React.memo(FilterChips);
