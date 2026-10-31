// Exercise actual badge callbacks and source-sheet selection without service calls.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const MarkdownIt = require('markdown-it');

function load(file, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
  }).outputText;
  vm.runInNewContext(code, { exports, require: name => dependencies[name] || {},
    setTimeout, clearTimeout, navigator: undefined, process: { env: {} } });
  return exports;
}
const citations = load('lib/citations.ts');
const sources = [
  { citation_number: 8, short_title: 'Law Eight', law_type: 'Republic Acts', label: 'Republic Acts', url: 'https://example.test/8', excerpts: ['Eight evidence'] },
  { citation_number: 2, short_title: 'Law Two', law_type: 'Republic Acts', label: 'Republic Acts', url: 'https://example.test/2', excerpts: ['Two evidence'] },
];
assert.equal(citations.findCitation(sources, 2), sources[1], 'explicit numbers override array position');
assert.equal(citations.findCitation(sources, 1), undefined, 'missing numbers must not point to another law');
assert.equal(citations.compactCitations('Claim [Source 2][Source 8].'), 'Claim [2][8].');
assert.equal(citations.compactCitations('Partial [Source '), 'Partial [Source ');
assert.equal(citations.compactCitations('[Document page 2]'), '[Document page 2]');
assert.equal(citations.findCitation([{short_title:'Legacy'}], 1).short_title, 'Legacy');

const stateUpdates = [];
const react = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  useState: value => [value, value => stateUpdates.push(value)],
  useEffect: () => {}, useMemo: fn => fn(), useCallback: fn => fn,
  useDeferredValue: value => value, useImperativeHandle: (ref, factory) => { ref.current = factory(); },
  memo: component => component, forwardRef: component => component,
};
const native = Object.fromEntries(['View','Text','TouchableOpacity','Pressable','Modal','ScrollView'].map(name => [name,name]));
Object.assign(native, { Platform: { OS: 'android' }, StyleSheet: { absoluteFill: {} } });
const theme = new Proxy({}, { get: () => '#123456' });
const shared = {
  react: { __esModule:true, ...react, default: react }, 'react-native': native,
  '../lib/theme': { useTheme: () => ({theme, mode:'light'}) },
  '../lib/citations': citations,
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({bottom:0}) },
  'expo-haptics': { impactAsync: async () => {}, ImpactFeedbackStyle: {} },
  '@expo/vector-icons': { Ionicons:'Icon' },
};
const animation = { duration: () => ({}) };
const Bubble = load('components/ChatBubble.tsx', {
  ...shared,
  'react-native-reanimated': { __esModule:true, default: {View:'AnimatedView'}, FadeInDown:animation, FadeInUp:animation },
  'react-native-markdown-display': { __esModule:true, default:'Markdown' },
  '../hooks/useTypewriter': { useTypewriter: content => ({displayedText:content,isTyping:false}) },
}).default;
function flatten(node) {
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (!node || typeof node !== 'object') return [];
  return [node, ...flatten(node.props?.children)];
}
const pressed = [];
const bubble = Bubble({role:'assistant',content:'Claim **supported** [Source 2][Source 8] and [Source 99].',sources,onCitationPress:n=>pressed.push(n)});
const markdown = flatten(bubble).find(node=>node.type==='Markdown');
assert.ok(markdown, 'completed answers render Markdown');
const tokens = new MarkdownIt().parseInline(markdown.props.children[0], {})[0].children;
const textNodes = tokens.filter(token=>token.type==='text');
const badges = textNodes.flatMap((token,index)=>flatten(markdown.props.rules.text({key:String(index),content:token.content},[],[],{text:{}})))
  .filter(node=>node.type==='Text' && node.props.accessibilityLabel);
const sourceTwo = badges.find(node=>node.props.accessibilityLabel.includes('Law Two'));
assert.ok(sourceTwo, 'badge uses the matching saved source title');
let stopped = false;
sourceTwo.props.onPress({stopPropagation:()=>{stopped=true;}});
assert.equal(stopped,true);
assert.deepEqual(pressed,[2]);
assert.equal(badges.find(node=>node.props.accessibilityLabel.includes('99')).props.onPress,undefined);

const SourceCard = load('components/SourceCard.tsx', shared).default;
const ref = {current:null};
SourceCard({sources,answer:'Claim [Source 2].'},ref);
stateUpdates.length=0;
ref.current.openCitation(2);
assert.equal(stateUpdates.at(-1).source,sources[1], 'badge opens its own evidence sheet');
assert.equal(stateUpdates.at(-1).source.excerpts[0],'Two evidence');
const count=stateUpdates.length;
ref.current.openCitation(99);
assert.equal(stateUpdates.length,count,'unavailable citation never opens an unrelated source');
console.log('PASS: compact citation badges, Markdown parsing, exact source identity, tap callbacks, missing-source safety, legacy sources, and evidence sheet selection');
