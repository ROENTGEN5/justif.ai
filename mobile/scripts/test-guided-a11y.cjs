// Verify guided question composition (English, Filipino, Taglish),
// structured answer extraction, and React Native accessibility contracts.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');

const guidedSrc = fs.readFileSync('components/GuidedTopicFlow.tsx', 'utf8');
const guidedTranspiled = ts.transpileModule(guidedSrc, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.React,
  },
}).outputText;

const guidedExports = {};
vm.runInNewContext(guidedTranspiled, {
  exports: guidedExports,
  require(name) {
    if (name === 'react') return { useState: (v) => [v, () => {}], createElement: () => null };
    if (name === 'react-native') return { View: 'View', Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity' };
    if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
    if (name === 'expo-haptics') return { impactAsync: async () => {}, ImpactFeedbackStyle: {} };
    if (name === '../lib/theme') return { useTheme: () => ({ theme: {} }) };
    return {};
  },
});

// 1. Verify explicit English, Filipino, and Taglish options
assert.deepEqual(
  Array.from(guidedExports.LANGUAGE_OPTIONS, (o) => o.id),
  ['English', 'Filipino', 'Taglish'],
  'Must offer English, Filipino, and Taglish explicitly'
);

// 2. Verify guided question composition includes What happened, When, and Desired outcome
const enPrompt = guidedExports.composeGuidedPrompt({
  categoryLabel: 'Labor & Employment',
  language: 'English',
  whatHappened: 'Dismissed without written notice',
  whenText: 'Last week',
  desiredOutcome: 'Recover backpay and severance',
});
assert.match(enPrompt, /English/);
assert.match(enPrompt, /What happened: Dismissed without written notice/);
assert.match(enPrompt, /When: Last week/);
assert.match(enPrompt, /What outcome I want: Recover backpay and severance/);
assert.match(enPrompt, /short explanation, relevant legal sources, and practical next steps/i);

const filPrompt = guidedExports.composeGuidedPrompt({
  categoryLabel: 'Labor & Employment',
  language: 'Filipino',
  whatHappened: 'Tinanggal nang walang abiso',
  whenText: 'Nakaraang linggo',
  desiredOutcome: 'Makuha ang final pay',
});
assert.match(filPrompt, /Filipino/);
assert.match(filPrompt, /Ano ang nangyari: Tinanggal nang walang abiso/);
assert.match(filPrompt, /Kailan nangyari: Nakaraang linggo/);
assert.match(filPrompt, /Nais na resulta: Makuha ang final pay/);

const taglishPrompt = guidedExports.composeGuidedPrompt({
  categoryLabel: 'Property & Tenancy',
  language: 'Taglish',
  whatHappened: 'Pinapa-evict agad ng landlord',
  whenText: 'Ongoing ngayon',
  desiredOutcome: 'Malaman ang legal rights ko',
});
assert.match(taglishPrompt, /Taglish/);
assert.match(taglishPrompt, /What happened: Pinapa-evict agad ng landlord/);
assert.match(taglishPrompt, /When: Ongoing ngayon/);
assert.match(taglishPrompt, /Desired outcome: Malaman ang legal rights ko/);

// 3. Verify accessibility attributes and stream-token suppression across components
const bubbleSrc = fs.readFileSync('components/ChatBubble.tsx', 'utf8');
assert.match(
  bubbleSrc,
  /accessibilityElementsHidden=\{true\}/,
  'Streamed/typing tokens must be hidden from screen readers to prevent token-by-token reading'
);
assert.match(bubbleSrc, /Short Explanation/);
assert.match(bubbleSrc, /Relevant Sources/);
assert.match(bubbleSrc, /Practical Next Steps/);

const chatIndexSrc = fs.readFileSync('app/(main)/chat/index.tsx', 'utf8');
assert.match(
  chatIndexSrc,
  /AccessibilityInfo\.announceForAccessibility/,
  'Chat screen must announce loading and completion states via AccessibilityInfo'
);

const chatInputSrc = fs.readFileSync('components/ChatInput.tsx', 'utf8');
assert.match(chatInputSrc, /accessibilityLabel="Attach document or photo"/);
assert.match(chatInputSrc, /accessibilityRole="button"/);

console.log('PASS: guided flows (EN/FIL/Taglish), 3-part answer presentation, and accessibility checks');
