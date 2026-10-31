const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
let timerId = 0;
const timers = new Map();
const clock = {
  setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
  clearTimeout: id => timers.delete(id),
};
const api = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/drawerUpdates.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: api, ...clock });

const motion = api.createDrawerMotion('alice');
const gate = api.createDrawerUpdates();
const rendered = [];
let opened = 0;
const unsubscribe = motion.subscribe({
  start: () => gate.pause(),
  end: closing => { gate.resume(); if (!closing) opened++; },
});
motion.start();
gate.run('history', () => rendered.push('old cache'));
gate.run('history', () => rendered.push('fresh history'));
gate.run('profile', () => rendered.push('profile'));
assert.deepEqual(rendered, [], 'No queued data renders during the opening slide');
motion.end(false);
assert.deepEqual(rendered, ['fresh history', 'profile'], 'Apply only the newest update per section');
assert.equal(opened, 1);
assert.equal(motion.isOpen(), true);
gate.run('history', () => rendered.push('manual refresh'));
assert.equal(rendered.at(-1), 'manual refresh', 'Updates apply immediately when idle');
motion.start();
gate.run('history', () => rendered.push('during closing'));
assert.equal(rendered.at(-1), 'manual refresh');
motion.end(true);
assert.equal(rendered.at(-1), 'during closing');
assert.equal(opened, 1, 'Closing must not start a new history load');
assert.equal(motion.isOpen(), false);
motion.start();
gate.run('history', () => rendered.push('unmounted account'));
gate.dispose();
unsubscribe();
motion.end(false);
gate.resume();
gate.run('history', () => rendered.push('late response'));
assert.equal(rendered.at(-1), 'during closing', 'Unmount discards queued and late updates');
const nextAccount = api.createDrawerMotion('bob');
assert.equal(nextAccount.isOpen(), false);
assert.equal(nextAccount.isMoving(), false);
// Regression: visibility must settle the drawer even with NO animation events.
const fallbackMotion = api.createDrawerMotion('alice');
const fallbackGate = api.createDrawerUpdates();
let fallbackLoaded = false;
fallbackMotion.subscribe({ start: () => fallbackGate.pause(), end: closing => {
  fallbackGate.resume();
  if (!closing) fallbackLoaded = true;
} });
fallbackMotion.observeVisibility(true);
fallbackGate.run('history', () => rendered.push('fallback history'));
assert.equal(fallbackLoaded, false);
[...timers.values()][0]();
assert.equal(fallbackLoaded, true, 'Missing transitionEnd must not leave history loading');
assert.equal(rendered.at(-1), 'fallback history');
fallbackMotion.dispose();
fallbackGate.dispose();
assert.equal(timers.size, 0);

const dataApi = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/drawerData.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: dataApi, ...clock });
(async () => {
  let settled = false, history = [], errors = 0;
  const callbacks = {
    cached: async () => [], history: async () => ['saved chat'],
    profile: () => new Promise(() => {}), // a stalled profile must not block chats
    onCached: value => { history = value; },
    onHistory: value => { history = value; },
    onProfile: () => { throw Error('Profile unexpectedly resolved'); },
    onError: () => { errors++; }, onSettled: () => { settled = true; },
  };
  await dataApi.loadDrawerData(callbacks);
  assert.equal(settled, true);
  assert.deepEqual(history, ['saved chat']);
  assert.equal(timers.size, 0);
  let finishHistory;
  settled = false;
  const request = dataApi.loadDrawerData({ ...callbacks,
    history: () => new Promise(resolve => { finishHistory = resolve; }),
  });
  await new Promise(resolve => setImmediate(resolve));
  [...timers.values()][0]();
  await request;
  assert.equal(errors, 1);
  assert.equal(settled, true, 'A stalled request must stop the skeleton and allow retry');
  finishHistory(['late result']);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(history, ['saved chat'], 'Timeout must discard late history results');
  assert.equal(timers.size, 0);
  console.log('PASS: drawer deferral, missed animation events, profile independence, history timeout, stale results, and cleanup');
})().catch(error => { console.error(error); process.exitCode = 1; });
