/**
 * GuidedTopicFlow Component
 * Turns legal topic cards into optional guided question flows:
 *   1. "What happened?"
 *   2. "When?"
 *   3. "What outcome do you want?"
 * Offers explicit language selection: English, Filipino, or Taglish.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "../lib/theme";
import { textFix, singleLine } from "../lib/textFix";

export type PreferredLanguage = "English" | "Filipino" | "Taglish";

export interface TopicCategory {
  id: string;
  label: string;
  emoji: string;
  icon: keyof typeof Ionicons.glyphMap;
  situations: Record<PreferredLanguage, string[]>;
  prompts: Record<PreferredLanguage, string[]>;
}

export const LANGUAGE_OPTIONS: {
  id: PreferredLanguage;
  label: string;
  sublabel: string;
}[] = [
  { id: "English", label: "English", sublabel: "Plain English" },
  { id: "Filipino", label: "Filipino", sublabel: "Wikang Filipino" },
  { id: "Taglish", label: "Taglish", sublabel: "Natural Taglish" },
];

export const LEGAL_TOPIC_CATEGORIES: TopicCategory[] = [
  {
    id: "labor",
    label: "Labor & Employment",
    emoji: "💼",
    icon: "briefcase-outline",
    situations: {
      English: [
        "Terminated or dismissed without clear notice",
        "Unpaid final pay, 13th month, or overtime pay",
        "Forced resignation or constructive dismissal",
      ],
      Filipino: [
        "Tinanggal sa trabaho nang walang malinaw na abiso",
        "Hindi binigay ang final pay, 13th month, o overtime pay",
        "Pinilit mag-resign ng employer",
      ],
      Taglish: [
        "Tinanggal sa work without proper notice or due process",
        "Na-hold ang final pay, 13th month, o overtime pay",
        "Pinilit mag-resign o constructive dismissal",
      ],
    },
    prompts: {
      English: [
        "What are the rules on severance and illegal dismissal?",
        "How are holiday and overtime pay calculated in the Philippines?",
      ],
      Filipino: [
        "Ano ang mga tuntunin sa separation pay at illegal dismissal sa Pilipinas?",
        "Paano kinukuwenta ang holiday pay at overtime pay ayon sa batas?",
      ],
      Taglish: [
        "Ano ang rules sa separation pay at illegal dismissal dito sa Pilipinas?",
        "Paano kino-compute ang holiday pay at overtime pay under Philippine labor law?",
      ],
    },
  },
  {
    id: "family",
    label: "Family & Civil",
    emoji: "👨‍👩‍👧",
    icon: "people-outline",
    situations: {
      English: [
        "Seeking child financial support from a co-parent",
        "Looking into annulment or declaration of nullity of marriage",
        "Property or inheritance dispute among family members",
      ],
      Filipino: [
        "Humihingi ng sustento para sa anak mula sa kabilang magulang",
        "Nagtatanong tungkol sa annulment o pagpapawalang-bisa ng kasal",
        "Hindi pagkakaunawaan sa mana o ari-arian ng pamilya",
      ],
      Taglish: [
        "Hihingi ng child support mula sa co-parent",
        "Magtatanong about annulment o nullity of marriage",
        "May dispute sa family property o mana",
      ],
    },
    prompts: {
      English: [
        "What are the legal grounds and process for annulment?",
        "What are the child support guidelines and enforcement rules?",
      ],
      Filipino: [
        "Ano ang mga legal na batayan at proseso para sa annulment?",
        "Ano ang mga alituntunin sa sustento ng bata at paano ito ipatutupad?",
      ],
      Taglish: [
        "Ano ang legal grounds at process para sa annulment sa Pilipinas?",
        "Ano ang rules sa child support at paano ito ipapa-enforce?",
      ],
    },
  },
  {
    id: "property",
    label: "Property & Tenancy",
    emoji: "🏠",
    icon: "home-outline",
    situations: {
      English: [
        "Landlord threatened eviction or locked the unit",
        "Security deposit or advance rent was not returned",
        "Unpaid personal loan or small claims collection",
      ],
      Filipino: [
        "Pinapaalis agad ng nagpapaupa o ikinandado ang bahay",
        "Hindi ibinalik ang security deposit o advance rent",
        "Hindi nabayarang utang na nais singilin sa small claims",
      ],
      Taglish: [
        "Pinapa-evict agad ng landlord nang walang notice",
        "Ayaw ibalik ang security deposit o advance rent",
        "May hindi nagbayad ng utang at gustong mag-file ng small claims",
      ],
    },
    prompts: {
      English: [
        "What are the tenant eviction rules under the Rent Control Act?",
        "How do I file a small claims case for unpaid debt?",
      ],
      Filipino: [
        "Ano ang mga tuntunin sa pagpapaalis ng nangungupahan sa ilalim ng Rent Control Act?",
        "Paano magsampa ng kasong small claims para sa hindi nabayarang utang?",
      ],
      Taglish: [
        "Ano ang tenant eviction rules under the Rent Control Act?",
        "Paano mag-file ng small claims case para sa hindi binayarang utang?",
      ],
    },
  },
  {
    id: "cyber",
    label: "Cyber & Penal",
    emoji: "💻",
    icon: "shield-checkmark-outline",
    situations: {
      English: [
        "Defamatory or false accusation posted on social media",
        "Scammed in an online payment or marketplace transaction",
        "Unauthorized disclosure of personal data or photos",
      ],
      Filipino: [
        " Mapaminsalang paratang na ipinost sa social media",
        "Naloko sa online payment o transaksyon sa internet",
        "Ibinahagi ang pribadong impormasyon o larawan nang walang pahintulot",
      ],
      Taglish: [
        "May nag-post ng paninira o false accusation sa social media",
        "Na-scam sa online payment o online selling transaction",
        "Pinakalat ang personal data o private photos nang walang consent",
      ],
    },
    prompts: {
      English: [
        "How do I file a cyber libel complaint under RA 10175?",
        "What are my legal remedies against online fraud and scams?",
      ],
      Filipino: [
        "Paano magsampa ng reklamong cyber libel sa ilalim ng RA 10175?",
        "Ano ang mga legal na hakbang laban sa online scam at panloloko?",
      ],
      Taglish: [
        "Paano mag-file ng cyber libel complaint under RA 10175?",
        "Ano ang legal remedies ko laban sa online fraud at scams?",
      ],
    },
  },
];

const WHEN_OPTIONS: Record<PreferredLanguage, string[]> = {
  English: ["Within the last 30 days", "1–6 months ago", "Over a year ago", "Ongoing right now"],
  Filipino: ["Nitong nakaraang 30 araw", "1–6 buwan na ang nakalipas", "Mahigit isang taon na", "Kasalukuyang nangyayari"],
  Taglish: ["Within the last 30 days", "1–6 months ago", "More than 1 year ago", "Ongoing ngayon"],
};

const OUTCOME_OPTIONS: Record<PreferredLanguage, string[]> = {
  English: [
    "Know my legal rights and options",
    "Recover money, pay, or refund",
    "File a complaint with the proper agency",
    "Respond to a notice or defend myself",
  ],
  Filipino: [
    "Malaman ang aking mga karapatan at opsyon",
    "Mabawi ang pera, sahod, o refund",
    "Maghain ng pormal na reklamo sa ahensya",
    "Sumagot sa abiso o ipagtanggol ang sarili",
  ],
  Taglish: [
    "Malaman ang legal rights at options ko",
    "Ma-recover ang pera, backpay, o refund",
    "Mag-file ng complaint sa tamang government agency",
    "Sumagot sa demand/notice at ma-defend ang sarili",
  ],
};

const STEP_LABELS: Record<
  PreferredLanguage,
  {
    guidedHeader: string;
    guidedSubtext: string;
    guidedCollapsedHint: string;
    whatHappened: string;
    whatPlaceholder: string;
    when: string;
    whenPlaceholder: string;
    outcome: string;
    outcomePlaceholder: string;
    askGuided: string;
    editInInput: string;
    quickAskHeader: string;
  }
> = {
  English: {
    guidedHeader: "Optional Guided Question Builder",
    guidedSubtext: "Share as much or as little as you want. All fields are optional.",
    guidedCollapsedHint: "Need help structuring your question? Tap to open the guided helper.",
    whatHappened: "1. What happened?",
    whatPlaceholder: "Briefly describe what happened (optional)...",
    when: "2. When?",
    whenPlaceholder: "e.g. Last week, March 2026, ongoing (optional)...",
    outcome: "3. What outcome do you want?",
    outcomePlaceholder: "e.g. Claim backpay, file complaint, know options (optional)...",
    askGuided: "Ask Guided Question",
    editInInput: "Review in Chat Box",
    quickAskHeader: "Or Quick-Ask a Starter Question",
  },
  Filipino: {
    guidedHeader: "Opsyonal na Gabay sa Pagtatanong",
    guidedSubtext: "Ilagay lamang ang mga detalyeng nais mong ibahagi. Opsyonal ang lahat ng patlang.",
    guidedCollapsedHint: "Kailangan ng tulong sa pagbuo ng tanong? Pindutin para buksan ang gabay.",
    whatHappened: "1. Ano ang nangyari? (What happened?)",
    whatPlaceholder: "Ipaliwanag nang maikli ang nangyari (opsyonal)...",
    when: "2. Kailan? (When?)",
    whenPlaceholder: "hal. Nakaraang linggo, Marso 2026, kasalukuyan (opsyonal)...",
    outcome: "3. Anong resulta ang gusto mo? (What outcome do you want?)",
    outcomePlaceholder: "hal. Makuha ang bayad, magsampa ng reklamo (opsyonal)...",
    askGuided: "Ipadala ang Tanong",
    editInInput: "I-edit sa Chat Box",
    quickAskHeader: "O Pumili ng Handang Tanong",
  },
  Taglish: {
    guidedHeader: "Optional Guided Question Flow",
    guidedSubtext: "Punan lang ang applicable sa sitwasyon mo. Optional lahat ng fields.",
    guidedCollapsedHint: "Need help i-structure ang tanong mo? Tap para buksan ang guided helper.",
    whatHappened: "1. What happened? (Ano ang nangyari?)",
    whatPlaceholder: "I-kwento nang maikli kung ano ang nangyari (optional)...",
    when: "2. When? (Kailan nangyari?)",
    whenPlaceholder: "e.g. Last week, 3 months ago, ongoing ngayon (optional)...",
    outcome: "3. What outcome do you want? (Anong gusto mong mangyari?)",
    outcomePlaceholder: "e.g. Ma-claim ang pay, mag-file ng complaint (optional)...",
    askGuided: "Send Guided Question",
    editInInput: "Edit sa Chat Box",
    quickAskHeader: "Or Tap a Quick Starter Question",
  },
};

export function composeGuidedPrompt(params: {
  categoryLabel: string;
  language: PreferredLanguage;
  whatHappened: string;
  whenText: string;
  desiredOutcome: string;
}): string {
  const { categoryLabel, language, whatHappened, whenText, desiredOutcome } = params;
  const parts: string[] = [];

  if (language === "Filipino") {
    parts.push(`Pakisagot sa wikang Filipino tungkol sa ${categoryLabel}.`);
    if (whatHappened.trim()) parts.push(`Ano ang nangyari: ${whatHappened.trim()}`);
    if (whenText.trim()) parts.push(`Kailan nangyari: ${whenText.trim()}`);
    if (desiredOutcome.trim()) parts.push(`Nais na resulta: ${desiredOutcome.trim()}`);
    parts.push(
      "Bigyan ako ng maikling paliwanag, mga kaugnay na batas o sanggunian, at mga praktikal na susunod na hakbang."
    );
  } else if (language === "Taglish") {
    parts.push(`Please answer in natural Taglish regarding ${categoryLabel}.`);
    if (whatHappened.trim()) parts.push(`What happened: ${whatHappened.trim()}`);
    if (whenText.trim()) parts.push(`When: ${whenText.trim()}`);
    if (desiredOutcome.trim()) parts.push(`Desired outcome: ${desiredOutcome.trim()}`);
    parts.push(
      "Pakibigay ang short explanation, relevant legal sources, at practical next steps."
    );
  } else {
    parts.push(`Please answer in English regarding ${categoryLabel}.`);
    if (whatHappened.trim()) parts.push(`What happened: ${whatHappened.trim()}`);
    if (whenText.trim()) parts.push(`When: ${whenText.trim()}`);
    if (desiredOutcome.trim()) parts.push(`What outcome I want: ${desiredOutcome.trim()}`);
    parts.push(
      "Please provide a short explanation, relevant legal sources, and practical next steps."
    );
  }

  return parts.join("\n");
}

interface GuidedTopicFlowProps {
  activeCategoryId: string;
  onSelectCategory: (id: string) => void;
  preferredLanguage: PreferredLanguage;
  onSelectLanguage: (lang: PreferredLanguage) => void;
  onSubmitPrompt: (prompt: string) => void;
  onPrefillPrompt: (prompt: string) => void;
}

export default function GuidedTopicFlow({
  activeCategoryId,
  onSelectCategory,
  preferredLanguage,
  onSelectLanguage,
  onSubmitPrompt,
  onPrefillPrompt,
}: GuidedTopicFlowProps) {
  const { theme } = useTheme();
  // Collapsed by default so the starter questions and chat input are visible
  // immediately; users can expand the builder when they want structure.
  const [isGuidedOpen, setIsGuidedOpen] = useState(false);
  const [whatHappened, setWhatHappened] = useState("");
  const [whenText, setWhenText] = useState("");
  const [desiredOutcome, setDesiredOutcome] = useState("");

  const activeCategory =
    LEGAL_TOPIC_CATEGORIES.find((c) => c.id === activeCategoryId) ||
    LEGAL_TOPIC_CATEGORIES[0];

  const labels = STEP_LABELS[preferredLanguage];
  const hasAnyGuidedInput =
    whatHappened.trim().length > 0 ||
    whenText.trim().length > 0 ||
    desiredOutcome.trim().length > 0;

  const buildCurrentPrompt = () =>
    composeGuidedPrompt({
      categoryLabel: activeCategory.label,
      language: preferredLanguage,
      whatHappened:
        whatHappened.trim() ||
        activeCategory.situations[preferredLanguage][0] ||
        activeCategory.label,
      whenText,
      desiredOutcome,
    });

  return (
    <View style={{ width: "100%", marginTop: 20 }}>
      {/* ─── Explicit Language Selector (English / Filipino / Taglish) ─── */}
      <View style={{ marginBottom: 16 }}>
        <Text
          {...textFix}
          accessibilityRole="header"
          style={{
            fontSize: 11,
            fontWeight: "700",
            color: theme.textTertiary,
            textTransform: "uppercase",
            letterSpacing: 0.6,
            marginBottom: 8,
            marginLeft: 4,
          }}
        >
          Response Language • Wika ng Sagot
        </Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Select response language: English, Filipino, or Taglish"
          style={{
            flexDirection: "row",
            padding: 3,
            borderRadius: 14,
            backgroundColor: theme.surfaceElevated,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          {LANGUAGE_OPTIONS.map((option) => {
            const selected = preferredLanguage === option.id;
            return (
              <TouchableOpacity
                key={option.id}
                activeOpacity={0.75}
                accessibilityRole="radio"
                accessibilityLabel={`${option.label} (${option.sublabel})`}
                accessibilityState={{ selected }}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  onSelectLanguage(option.id);
                }}
                style={{
                  flex: 1,
                  minHeight: 38,
                  paddingHorizontal: 6,
                  paddingVertical: 8,
                  borderRadius: 11,
                  backgroundColor: selected ? theme.chipActiveBg : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  {...singleLine}
                  style={{
                    fontSize: 13,
                    fontWeight: selected ? "700" : "500",
                    color: selected ? theme.chipActiveText : theme.chipText,
                  }}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text
          {...textFix}
          style={{
            fontSize: 11,
            color: theme.textTertiary,
            marginTop: 6,
            marginLeft: 4,
          }}
        >
          {LANGUAGE_OPTIONS.find((o) => o.id === preferredLanguage)?.sublabel}
        </Text>
      </View>

      {/* ─── Categorized Legal Topic Selector Pills ─── */}
      <Text
        {...textFix}
        accessibilityRole="header"
        style={{
          fontSize: 11,
          fontWeight: "700",
          color: theme.textTertiary,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          marginBottom: 8,
          marginLeft: 4,
        }}
      >
        Explore Legal Topics
      </Text>

      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 14,
        }}
      >
        {LEGAL_TOPIC_CATEGORIES.map((category) => {
          const isSelected = category.id === activeCategory.id;
          return (
            <TouchableOpacity
              key={category.id}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityLabel={`Topic: ${category.label}`}
              accessibilityState={{ selected: isSelected }}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onSelectCategory(category.id);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 8,
                minHeight: 38,
                maxWidth: "100%",
                borderRadius: 20,
                backgroundColor: isSelected ? theme.chipActiveBg : theme.cardBg,
                borderWidth: 1,
                borderColor: isSelected ? theme.chipActiveBg : theme.border,
              }}
            >
              <Text style={{ fontSize: 13 }}>{category.emoji}</Text>
              <Text
                {...singleLine}
                style={{
                  flexShrink: 1,
                  fontSize: 12,
                  fontWeight: isSelected ? "700" : "600",
                  color: isSelected ? theme.chipActiveText : theme.chipText,
                }}
              >
                {category.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ─── Optional Guided Flow Card: What happened? / When? / What outcome do you want? ─── */}
      <View
        style={{
          backgroundColor: theme.cardBg,
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: 16,
          padding: 14,
          marginBottom: 14,
        }}
      >
        <TouchableOpacity
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={`${labels.guidedHeader} for ${activeCategory.label}. ${isGuidedOpen ? "Collapse" : "Expand"}`}
          accessibilityState={{ expanded: isGuidedOpen }}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            setIsGuidedOpen((prev) => !prev);
          }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            minHeight: 36,
            gap: 10,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
            <Ionicons name="compass-outline" size={18} color={theme.accent} />
            <View style={{ flex: 1 }}>
              <Text
                {...textFix}
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: theme.text,
                }}
              >
                {labels.guidedHeader}
              </Text>
              <Text
                {...textFix}
                style={{
                  fontSize: 11,
                  color: theme.textSecondary,
                  marginTop: 1,
                  lineHeight: 15,
                }}
              >
                {isGuidedOpen ? labels.guidedSubtext : labels.guidedCollapsedHint}
              </Text>
            </View>
          </View>
          <Ionicons
            name={isGuidedOpen ? "chevron-up" : "chevron-down"}
            size={18}
            color={theme.textTertiary}
          />
        </TouchableOpacity>

        {isGuidedOpen && (
          <View style={{ marginTop: 12, gap: 12 }}>
            {/* Step 1: What happened? */}
            <View style={{ gap: 6 }}>
              <Text
                {...textFix}
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: theme.text,
                }}
              >
                {labels.whatHappened}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {activeCategory.situations[preferredLanguage].map((sit, idx) => {
                  const selected = whatHappened === sit;
                  return (
                    <TouchableOpacity
                      key={idx}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`What happened option: ${sit}`}
                      accessibilityState={{ selected }}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setWhatHappened(selected ? "" : sit);
                      }}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        minHeight: 34,
                        maxWidth: "100%",
                        borderRadius: 12,
                        backgroundColor: selected ? theme.chipActiveBg : theme.surfaceElevated,
                        borderWidth: 1,
                        borderColor: selected ? theme.chipActiveBg : theme.chipBorder,
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        {...textFix}
                        style={{
                          fontSize: 12,
                          lineHeight: 16,
                          fontWeight: selected ? "700" : "500",
                          color: selected ? theme.chipActiveText : theme.chipText,
                        }}
                      >
                        {sit}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TextInput
                value={whatHappened}
                onChangeText={setWhatHappened}
                placeholder={labels.whatPlaceholder}
                placeholderTextColor={theme.textTertiary}
                accessibilityLabel={labels.whatHappened}
                multiline
                style={{
                  backgroundColor: theme.surfaceElevated,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  minHeight: 40,
                  fontSize: 13,
                  color: theme.text,
                }}
              />
            </View>

            {/* Step 2: When? */}
            <View style={{ gap: 6 }}>
              <Text
                {...textFix}
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: theme.text,
                }}
              >
                {labels.when}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {WHEN_OPTIONS[preferredLanguage].map((option, idx) => {
                  const selected = whenText === option;
                  return (
                    <TouchableOpacity
                      key={idx}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`When option: ${option}`}
                      accessibilityState={{ selected }}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setWhenText(selected ? "" : option);
                      }}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        minHeight: 34,
                        maxWidth: "100%",
                        borderRadius: 12,
                        backgroundColor: selected ? theme.chipActiveBg : theme.surfaceElevated,
                        borderWidth: 1,
                        borderColor: selected ? theme.chipActiveBg : theme.chipBorder,
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        {...textFix}
                        style={{
                          fontSize: 12,
                          lineHeight: 16,
                          fontWeight: selected ? "700" : "500",
                          color: selected ? theme.chipActiveText : theme.chipText,
                        }}
                      >
                        {option}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TextInput
                value={whenText}
                onChangeText={setWhenText}
                placeholder={labels.whenPlaceholder}
                placeholderTextColor={theme.textTertiary}
                accessibilityLabel={labels.when}
                style={{
                  backgroundColor: theme.surfaceElevated,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  minHeight: 40,
                  fontSize: 13,
                  color: theme.text,
                }}
              />
            </View>

            {/* Step 3: What outcome do you want? */}
            <View style={{ gap: 6 }}>
              <Text
                {...textFix}
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: theme.text,
                }}
              >
                {labels.outcome}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {OUTCOME_OPTIONS[preferredLanguage].map((option, idx) => {
                  const selected = desiredOutcome === option;
                  return (
                    <TouchableOpacity
                      key={idx}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Desired outcome option: ${option}`}
                      accessibilityState={{ selected }}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setDesiredOutcome(selected ? "" : option);
                      }}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        minHeight: 34,
                        maxWidth: "100%",
                        borderRadius: 12,
                        backgroundColor: selected ? theme.chipActiveBg : theme.surfaceElevated,
                        borderWidth: 1,
                        borderColor: selected ? theme.chipActiveBg : theme.chipBorder,
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        {...textFix}
                        style={{
                          fontSize: 12,
                          lineHeight: 16,
                          fontWeight: selected ? "700" : "500",
                          color: selected ? theme.chipActiveText : theme.chipText,
                        }}
                      >
                        {option}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TextInput
                value={desiredOutcome}
                onChangeText={setDesiredOutcome}
                placeholder={labels.outcomePlaceholder}
                placeholderTextColor={theme.textTertiary}
                accessibilityLabel={labels.outcome}
                style={{
                  backgroundColor: theme.surfaceElevated,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  minHeight: 40,
                  fontSize: 13,
                  color: theme.text,
                }}
              />
            </View>

            {/* Action Buttons: Send Guided Question or Edit in Input Box */}
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 4,
              }}
            >
              <TouchableOpacity
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={labels.askGuided}
                accessibilityHint="Submits your guided question to Justif.ai"
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  onSubmitPrompt(buildCurrentPrompt());
                }}
                style={{
                  flex: 1,
                  minWidth: 150,
                  minHeight: 42,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 12,
                  backgroundColor: theme.accent,
                }}
              >
                <Ionicons name="sparkles-outline" size={15} color={theme.accentText} />
                <Text
                  {...singleLine}
                  style={{
                    flexShrink: 1,
                    fontSize: 13,
                    fontWeight: "700",
                    color: theme.accentText,
                  }}
                >
                  {labels.askGuided}
                </Text>
              </TouchableOpacity>

              {hasAnyGuidedInput && (
                <TouchableOpacity
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={labels.editInInput}
                  accessibilityHint="Copies your guided question into the text box for further editing"
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    onPrefillPrompt(buildCurrentPrompt());
                  }}
                  style={{
                    minHeight: 42,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderRadius: 12,
                    backgroundColor: theme.surfaceElevated,
                    borderWidth: 1,
                    borderColor: theme.border,
                  }}
                >
                  <Ionicons name="create-outline" size={15} color={theme.text} />
                  <Text
                    {...singleLine}
                    style={{
                      flexShrink: 1,
                      fontSize: 12,
                      fontWeight: "600",
                      color: theme.text,
                    }}
                  >
                    {labels.editInInput}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>

      {/* ─── Quick-Ask Starter Prompt Cards for Selected Category & Language ─── */}
      <Text
        {...textFix}
        accessibilityRole="header"
        style={{
          fontSize: 11,
          fontWeight: "700",
          color: theme.textTertiary,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          marginBottom: 8,
          marginLeft: 4,
        }}
      >
        {labels.quickAskHeader}
      </Text>

      <View style={{ gap: 10, width: "100%" }}>
        {activeCategory.prompts[preferredLanguage].map((prompt, index) => (
          <TouchableOpacity
            key={`${activeCategory.id}-${preferredLanguage}-${index}`}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Quick ask: ${prompt}`}
            accessibilityHint="Sends this starter question immediately"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onSubmitPrompt(prompt);
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: theme.cardBg,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 14,
              paddingVertical: 13,
              paddingHorizontal: 16,
              minHeight: 48,
              gap: 12,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
              <Ionicons
                name={activeCategory.icon}
                size={16}
                color={theme.accent}
              />
              <Text
                {...textFix}
                style={{
                  flex: 1,
                  fontSize: 13,
                  fontWeight: "500",
                  color: theme.text,
                  lineHeight: 19,
                }}
              >
                {prompt}
              </Text>
            </View>
            <Ionicons
              name="arrow-forward-circle-outline"
              size={18}
              color={theme.textTertiary}
            />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
