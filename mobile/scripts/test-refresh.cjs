const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const api = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/pullRefresh.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: api });

(async () => {
  let blocked = false, busy = false, error = '', displayed = ['existing'];
  const pending = [];
  const refresh = api.createPullRefresh({
    blocked: () => blocked,
    load: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
    apply: data => { displayed = data; },
    busy: value => { busy = value; },
    error: value => { error = value; },
  });
  blocked = true;
  await refresh.refresh();
  assert.equal(pending.length, 0, 'Streaming/failed requests must block refresh');
  blocked = false;
  const first = refresh.refresh();
  await refresh.refresh();
  assert.equal(pending.length, 1, 'Repeated pulls must not duplicate requests');
  assert.equal(busy, true);
  assert.deepEqual(displayed, ['existing'], 'Keep visible messages while loading');
  pending[0].reject(new Error('offline'));
  await first;
  assert.deepEqual(displayed, ['existing'], 'Failure must not clear messages');
  assert.match(error, /connection/);
  assert.equal(busy, false);
  const old = refresh.refresh();
  refresh.cancel();
  const newer = refresh.refresh();
  pending[1].resolve(['stale']);
  await old;
  assert.deepEqual(displayed, ['existing'], 'Ignore results invalidated by navigation');
  assert.equal(busy, true, 'Old completion must not stop the newer spinner');
  pending[2].resolve(['fresh']);
  await newer;
  assert.deepEqual(displayed, ['fresh']);
  assert.equal(error, '');
  assert.equal(busy, false);
  console.log('PASS: refresh blocking, duplicate pulls, retained content, offline feedback, stale response rejection, and retry');
})().catch(error => { console.error(error); process.exitCode = 1; });
