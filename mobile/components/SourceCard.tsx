/**
 * SourceCard Component
 * Displays cited law sources below an AI response with semantic authority badges,
 * official record verification indicators, and an in-app Legal Source Explorer bottom sheet.
 */

import React, { useState, useImperativeHandle, ForwardedRef } from "react";
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Modal,
  StyleSheet,
  Platform,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../lib/theme";
import { LawSource } from "../lib/api";
import { citationNumber, findCitation, compactCitations, splitCitations } from "../lib/citations";

export interface SourceCardHandle {
  openCitation: (number: number) => void;
}

interface SourceCardProps {
  sources: LawSource[];
  answer?: string;
}

const lawTypeLabels: Record<string, string> = {
  "Republic Acts": "RA",
  "Presidential Decree": "PD",
  "Presidential Decrees": "PD",
  "Executive Orders": "EO",
  "Batas Pambansa": "BP",
  "Administrative Orders": "AO",
  "Memorandum Orders": "MO",
  "Presidential Proclamations": "PP",
  "National Administrative Register": "NAR",
  "Memorandum Circulars": "MC",
  "Official Gazette": "OG",
  "Decisions / Signed Resolutions": "SC",
  "Supreme Court Decisions": "SC",
  "1934-35 ConCon": "CC",
};

interface BadgeStyle {
  bg: string;
  text: string;
  border: string;
  authorityLabel: string;
  authorityDescription: string;
}

function getAuthorityBadgeStyle(code: string, isDark: boolean): BadgeStyle {
  switch (code) {
    case "RA":
    case "BP":
      // Primary Legislation — Deep Indigo / Blue
      return isDark
        ? {
            bg: "#1E3A8A",
            text: "#DBEAFE",
            border: "#3B82F6",
            authorityLabel: "Statute",
            authorityDescription:
              "Primary national legislation enacted by the Congress of the Philippines (or Batasang Pambansa) and signed into law by the President.",
          }
        : {
            bg: "#DBEAFE",
            text: "#1E3A8A",
            border: "#93C5FD",
            authorityLabel: "Statute",
            authorityDescription:
              "Primary national legislation enacted by the Congress of the Philippines (or Batasang Pambansa) and signed into law by the President.",
          };
    case "SC":
    case "SR":
      // Supreme Court Jurisprudence — Rich Amber / Gold
      return isDark
        ? {
            bg: "#78350F",
            text: "#FEF3C7",
            border: "#F59E0B",
            authorityLabel: "Jurisprudence",
            authorityDescription:
              "Binding judicial precedent and interpretation rendered by the Supreme Court of the Philippines under Article 8 of the Civil Code.",
          }
        : {
            bg: "#FEF3C7",
            text: "#78350F",
            border: "#FCD34D",
            authorityLabel: "Jurisprudence",
            authorityDescription:
              "Binding judicial precedent and interpretation rendered by the Supreme Court of the Philippines under Article 8 of the Civil Code.",
          };
    case "EO":
    case "PD":
    case "PP":
    case "AO":
      // Executive Issuances — Emerald / Teal
      return isDark
        ? {
            bg: "#064E3B",
            text: "#D1FAE5",
            border: "#10B981",
            authorityLabel: "Executive",
            authorityDescription:
              "Presidential decree, order, or proclamation issued under constitutional or delegated executive authority of the President of the Philippines.",
          }
        : {
            bg: "#D1FAE5",
            text: "#064E3B",
            border: "#6EE7B7",
            authorityLabel: "Executive",
            authorityDescription:
              "Presidential decree, order, or proclamation issued under constitutional or delegated executive authority of the President of the Philippines.",
          };
    default:
      // General / Circulars / Official Gazette — Neutral Slate
      return isDark
        ? {
            bg: "#334155",
            text: "#F1F5F9",
            border: "#64748B",
            authorityLabel: "Official Record",
            authorityDescription:
              "Official Philippine government record, administrative issuance, or constitutional archive indexed in the Official Gazette.",
          }
        : {
            bg: "#E2E8F0",
            text: "#1E293B",
            border: "#CBD5E1",
            authorityLabel: "Official Record",
            authorityDescription:
              "Official Philippine government record, administrative issuance, or constitutional archive indexed in the Official Gazette.",
          };
  }
}

interface SelectedSourceItem {
  source: LawSource;
  code: string;
  badgeStyle: BadgeStyle;
}

function SourceCard({ sources, answer = "" }: SourceCardProps, ref: ForwardedRef<SourceCardHandle>) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SelectedSourceItem | null>(null);
  const { theme, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = mode === "dark" || mode === "night";

  useImperativeHandle(ref, () => ({
    openCitation(number) {
      const source = findCitation(sources, number);
      if (!source) return;
      const rawType = source.law_type || source.label || "LAW";
      const code = lawTypeLabels[rawType] || lawTypeLabels[source.label] || rawType.slice(0, 3).toUpperCase();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setSelectedItem({ source, code, badgeStyle: getAuthorityBadgeStyle(code, isDark) });
    },
  }), [sources, isDark]);

  if (!sources || sources.length === 0) return null;

  const handleToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setIsExpanded((prev) => !prev);
  };

  const handleSelectSource = (
    source: LawSource,
    code: string,
    badgeStyle: BadgeStyle
  ) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedItem({ source, code, badgeStyle });
  };

  const handleCloseSheet = () => {
    setSelectedItem(null);
  };

  const handleOpenExternalUrl = (url?: string) => {
    if (!url) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedItem(null);
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View className="items-start px-4 mb-3">
      <View
        style={{
          width: "95%",
          backgroundColor: theme.sourceBg,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: theme.sourceBorder,
          overflow: "hidden",
        }}
      >
        <TouchableOpacity
          onPress={handleToggle}
          accessibilityRole="button"
          accessibilityLabel={`Legal sources (${sources.length}). ${isExpanded ? "Collapse" : "Expand"}`}
          accessibilityState={{ expanded: isExpanded }}
          activeOpacity={0.7}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 14,
            paddingVertical: 11,
            backgroundColor: theme.sourceHeaderBg,
            borderBottomWidth: isExpanded ? 1 : 0,
            borderBottomColor: theme.sourceBorder,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
            <Ionicons name="library-outline" size={15} color={theme.textSecondary} />
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: theme.textSecondary,
                letterSpacing: 0.3,
              }}
            >
              Legal sources ({sources.length})
            </Text>

            {/* Official Legal Record Verified Pill */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: 10,
                backgroundColor: isDark ? "rgba(16, 185, 129, 0.15)" : "rgba(5, 150, 105, 0.1)",
                borderWidth: 1,
                borderColor: isDark ? "rgba(16, 185, 129, 0.3)" : "rgba(5, 150, 105, 0.25)",
              }}
            >
              <Ionicons
                name="checkmark-circle"
                size={11}
                color={isDark ? "#34D399" : "#059669"}
              />
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "600",
                  color: isDark ? "#34D399" : "#059669",
                }}
              >
                Indexed
              </Text>
            </View>
          </View>

          <Ionicons
            name={isExpanded ? "chevron-up" : "chevron-down"}
            size={16}
            color={theme.textTertiary}
          />
        </TouchableOpacity>

        {isExpanded && (
          <View style={{ padding: 10 }}>
            {sources.map((source, index) => {
              const rawType = source.law_type || source.label || "LAW";
              const code =
                lawTypeLabels[rawType] ||
                lawTypeLabels[source.label] ||
                rawType.slice(0, 3).toUpperCase();
              const badgeStyle = getAuthorityBadgeStyle(code, isDark);

              return (
                <TouchableOpacity
                  key={index}
                  activeOpacity={0.7}
                  onPress={() => handleSelectSource(source, code, badgeStyle)}
                  accessibilityRole="button"
                  accessibilityLabel={`Inspect legal source ${citationNumber(source, index)}: ${source.short_title || source.full_title || "Untitled Legal Source"}`}
                  accessibilityHint="Opens legal source excerpt and details"
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    paddingVertical: 10,
                    paddingHorizontal: 6,
                    borderBottomWidth: index < sources.length - 1 ? 1 : 0,
                    borderBottomColor: theme.divider,
                    gap: 10,
                  }}
                >
                  {/* Semantic Authority Badge */}
                  <View
                    style={{
                      backgroundColor: badgeStyle.bg,
                      borderColor: badgeStyle.border,
                      borderWidth: 1,
                      paddingHorizontal: 7,
                      paddingVertical: 3,
                      borderRadius: 6,
                      minWidth: 36,
                      alignItems: "center",
                      marginTop: 2,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "800",
                        color: badgeStyle.text,
                        letterSpacing: 0.4,
                      }}
                    >
                      {code}
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "600",
                        color: theme.text,
                        lineHeight: 18,
                      }}
                    >
                      [{citationNumber(source, index)}] {source.short_title || source.full_title || "Untitled Legal Source"}
                    </Text>

                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 8,
                        marginTop: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "600",
                          color: badgeStyle.text,
                          opacity: 0.85,
                        }}
                      >
                        {badgeStyle.authorityLabel}
                      </Text>
                      {source.date ? (
                        <Text style={{ fontSize: 11, color: theme.textTertiary }}>
                          • {source.date}
                        </Text>
                      ) : null}
                      {source.url ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                          <Ionicons
                            name="shield-checkmark-outline"
                            size={11}
                            color={theme.textTertiary}
                          />
                          <Text style={{ fontSize: 10, color: theme.textTertiary }}>
                            Tap to preview
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={14}
                    color={theme.textTertiary}
                    style={{ marginTop: 4 }}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* ─── In-App Legal Source Explorer Bottom Sheet ─────── */}
      <Modal
        visible={Boolean(selectedItem)}
        transparent
        animationType="slide"
        onRequestClose={handleCloseSheet}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable
            onPress={handleCloseSheet}
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(0,0,0,0.45)" },
            ]}
          />
          {selectedItem && (
            <ScrollView
              style={{
                maxHeight: "85%",
                backgroundColor: theme.surfaceElevated,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                borderTopWidth: 1,
                borderTopColor: theme.border,
                paddingHorizontal: 20,
                paddingTop: 14,
                paddingBottom: Math.max(
                  insets.bottom + 16,
                  Platform.OS === "ios" ? 36 : 24
                ),
              }}
            >
              {/* Drag Handle Bar */}
              <View
                style={{
                  width: 40,
                  height: 4,
                  backgroundColor: theme.border,
                  borderRadius: 2,
                  alignSelf: "center",
                  marginBottom: 16,
                }}
              />

              {/* Top Header Row: Badge + Close */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 14,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View
                    style={{
                      backgroundColor: selectedItem.badgeStyle.bg,
                      borderColor: selectedItem.badgeStyle.border,
                      borderWidth: 1,
                      paddingHorizontal: 9,
                      paddingVertical: 4,
                      borderRadius: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "800",
                        color: selectedItem.badgeStyle.text,
                        letterSpacing: 0.5,
                      }}
                    >
                      {selectedItem.code} • {selectedItem.badgeStyle.authorityLabel.toUpperCase()}
                    </Text>
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 10,
                      backgroundColor: isDark
                        ? "rgba(16, 185, 129, 0.15)"
                        : "rgba(5, 150, 105, 0.1)",
                      borderWidth: 1,
                      borderColor: isDark
                        ? "rgba(16, 185, 129, 0.3)"
                        : "rgba(5, 150, 105, 0.25)",
                    }}
                  >
                    <Ionicons
                      name="shield-checkmark"
                      size={11}
                      color={isDark ? "#34D399" : "#059669"}
                    />
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "700",
                        color: isDark ? "#34D399" : "#059669",
                      }}
                    >
                      Indexed source
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={handleCloseSheet}
                  accessibilityRole="button"
                  accessibilityLabel="Close legal source details"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    backgroundColor: theme.border,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Ionicons name="close" size={16} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Short Title & Date */}
              <Text
                style={{
                  fontSize: 17,
                  fontWeight: "800",
                  color: theme.text,
                  lineHeight: 23,
                  marginBottom: 6,
                }}
              >
                {selectedItem.source.short_title ||
                  selectedItem.source.full_title ||
                  "Cited Philippine Legal Authority"}
              </Text>

              {selectedItem.source.date ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 14,
                  }}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={13}
                    color={theme.textSecondary}
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: theme.textSecondary,
                    }}
                  >
                    Promulgated / Enacted: {selectedItem.source.date}
                  </Text>
                </View>
              ) : null}

              {/* Full Legal Title / Description Box */}
              {selectedItem.source.full_title &&
              selectedItem.source.full_title !== selectedItem.source.short_title ? (
                <View
                  style={{
                    backgroundColor: theme.cardBg,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: theme.border,
                    padding: 12,
                    marginBottom: 12,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "700",
                      color: theme.textTertiary,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      marginBottom: 4,
                    }}
                  >
                    Official Title
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: theme.text,
                      lineHeight: 19,
                    }}
                  >
                    {selectedItem.source.full_title}
                  </Text>
                </View>
              ) : null}

              <ScrollView nestedScrollEnabled style={{maxHeight: 230, marginBottom: 12}}>
                <Text style={{color: theme.accent, fontWeight: "700"}}>
                  [{citationNumber(selectedItem.source, sources.indexOf(selectedItem.source))}] {selectedItem.source.section?.trim() || "Retrieved passage"}
                </Text>
                <Text style={{color: theme.textSecondary, marginVertical: 6}}>
                  Retrieved evidence. Claim support and current legal status have not been independently verified.
                </Text>
                {answer.split(/\n/).filter(line => splitCitations(line).some(part => part.number === citationNumber(selectedItem.source, sources.indexOf(selectedItem.source)))).map((claim, index) => (
                  <Text key={`claim-${index}`} selectable style={{color: theme.text, marginBottom: 8}}>Citing passage: {compactCitations(claim)}</Text>
                ))}
                {(selectedItem.source.excerpts || []).map((excerpt, index) => (
                  <Text key={index} selectable style={{color: theme.text, marginBottom: 12, lineHeight: 21}}>{excerpt}</Text>
                ))}
                {!selectedItem.source.excerpts?.length && <Text style={{color: theme.textSecondary}}>No saved excerpt for this older answer. Open the source record to inspect it.</Text>}
              </ScrollView>
              {/* Legal Authority Weight & Jurisdiction Box */}
              <View
                style={{
                  backgroundColor: theme.cardBg,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderLeftWidth: 3,
                  borderLeftColor: theme.accent,
                  padding: 12,
                  marginBottom: 18,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 4,
                  }}
                >
                  <Ionicons name="scale-outline" size={14} color={theme.accent} />
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "700",
                      color: theme.accent,
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                    }}
                  >
                    Philippine Legal Authority ({selectedItem.source.law_type || selectedItem.badgeStyle.authorityLabel})
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.textSecondary,
                    lineHeight: 18,
                  }}
                >
                  {selectedItem.badgeStyle.authorityDescription}
                </Text>
              </View>

              {/* Action Buttons */}
              <View style={{ gap: 10 }}>
                {selectedItem.source.url ? (
                  <TouchableOpacity
                    onPress={() => handleOpenExternalUrl(selectedItem.source.url)}
                    accessibilityRole="link"
                    accessibilityLabel={`Open official source record for ${selectedItem.source.short_title || "cited legal source"}`}
                    activeOpacity={0.8}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      backgroundColor: theme.accent,
                      paddingVertical: 13,
                      borderRadius: 14,
                    }}
                  >
                    <Ionicons
                      name="globe-outline"
                      size={17}
                      color={theme.accentText}
                    />
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "700",
                        color: theme.accentText,
                      }}
                    >
                      Open source record
                    </Text>
                    <Ionicons
                      name="open-outline"
                      size={15}
                      color={theme.accentText}
                    />
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  onPress={handleCloseSheet}
                  accessibilityRole="button"
                  accessibilityLabel="Close legal source details"
                  activeOpacity={0.7}
                  style={{
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 11,
                    borderRadius: 14,
                    backgroundColor: theme.cardBg,
                    borderWidth: 1,
                    borderColor: theme.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: theme.textSecondary,
                    }}
                  >
                    Return to Conversation
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

export default React.memo(React.forwardRef(SourceCard));
