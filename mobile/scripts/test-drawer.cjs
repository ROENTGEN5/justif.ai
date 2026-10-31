const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const api = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/drawerUpdates.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: api });

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
console.log('PASS: drawer animation deferral, coalescing, idle updates, close handling, cleanup, and account isolation');
