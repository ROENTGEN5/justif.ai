// Exercise the real TypeScript API with a fake transport; no service calls.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync('lib/api.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const requests = [];
let nextFetchResponse = null;
let cacheWrites = 0;
let testNow = Date.now();
class XHR {
  responseText = ''; status = 200;
  constructor() { requests.push(this); }
  open() {} setRequestHeader() {} send(body) { this.body = JSON.parse(body); }
  abort() { this.onabort?.(); }
  event(event) { this.responseText += 'data: ' + JSON.stringify(event) + '\n\n'; this.onprogress(); }
}
const exportsObject = {};
vm.runInNewContext(code, {
  exports: exportsObject, process: { env: {} }, __DEV__: true,
  XMLHttpRequest: XHR, setTimeout, clearTimeout, AbortController,
  Date: class extends Date { static now() { return testNow; } },
  fetch: async (url, options) => {
    if (typeof nextFetchResponse === 'function') return nextFetchResponse(url, options);
    return nextFetchResponse;
  },
  require(name) {
    if (name === './supabase') return {
      supabase: {
        auth: {
          getSession: async () => ({
            data: { session: { access_token: 'test', user: { id: 'user-a' } } },
          }),
        },
      },
    };
    if (name === './conversationCache') return {
      cacheOwner: async () => 'user-a',
      writeCache: async () => { cacheWrites++; },
      clearConversationCaches: async () => {},
      readCache: async (scope) => scope === 'chats'
        ? [{ id: 'cached-chat', title: 'Cached Chat', created_at: '', updated_at: '' }]
        : [{ id: 'cached-msg', role: 'assistant', content: 'Cached body', created_at: '' }],
    };
    if (name === 'react-native') return { Platform: { select: () => 'http://test' } };
    return {};
  },
});
async function start(callbacks, signal, requestId) {
  const promise = exportsObject.streamMessage('question', undefined, undefined, callbacks, signal, requestId);
  // Attach rejection handling before driving the fake transport.
  promise.catch(() => {});
  await new Promise(resolve => setImmediate(resolve));
  return { promise, xhr: requests.at(-1) };
}
(async () => {
  let updates = [];
  let { promise, xhr } = await start({ onToken: text => updates.push(text) });
  xhr.event({ type: 'token', text: 'A' });
  for (let i = 0; i < 20; i++) xhr.event({ type: 'token', text: '界' });
  assert.equal(updates.length, 1, 'first token immediate, subsequent tokens buffered');
  const answer = 'A' + '界'.repeat(20);
  xhr.event({ type: 'done', response: answer, chat_id: 'chat' }); xhr.onload();
  assert.equal((await promise).response, answer);
  assert.equal(updates.at(-1), answer, 'completion flushes all text');
  const count = requests.length;
  ({ promise, xhr } = await start());
  xhr.event({ type: 'token', text: 'partial' }); xhr.onerror();
  await assert.rejects(promise, error => error.partialAnswer === 'partial');
  assert.equal(requests.length, count + 1, 'disconnect must not resubmit');
  ({ promise, xhr } = await start()); xhr.onload();
  await assert.rejects(promise, /before completion/);
  ({ promise, xhr } = await start()); xhr.status = 404; xhr.onload();
  await assert.rejects(promise, /404/);
  ({ promise, xhr } = await start()); xhr.ontimeout();
  await assert.rejects(promise, /timed out/);
  const controller = new AbortController();
  ({ promise, xhr } = await start(undefined, controller.signal)); controller.abort();
  await assert.rejects(promise, /canceled/);
  ({ promise, xhr } = await start(undefined, undefined, 'request_123456789'));
  assert.equal(xhr.body.request_id, 'request_123456789');
  xhr.event({type:'done', response:'saved answer', chat_id:'chat', message_id:'saved'}); xhr.onload();
  assert.equal((await promise).message_id, 'saved', 'completed replay needs no streamed tokens');
  ({ promise, xhr } = await start()); xhr.status=409; xhr.responseText=JSON.stringify({detail:'This request is still processing. Retry shortly.'}); xhr.onload();
  await assert.rejects(promise, /still processing/);

  // Verify M06/M11/M12: 401/403/404 must NOT fall back to offline cache
  for (const status of [401, 403, 404]) {
    nextFetchResponse = {
      ok: false,
      status,
      json: async () => ({ detail: `HTTP ${status} denied` }),
    };
    await assert.rejects(exportsObject.getChatMessages('chat-1'), new RegExp(`HTTP ${status} denied`));
    await assert.rejects(exportsObject.getChats(), new RegExp(`HTTP ${status} denied`));
  }

  // Verify M10: genuine network failure falls back to user-scoped offline cache
  nextFetchResponse = () => { throw new Error('Network request failed'); };
  await assert.rejects(exportsObject.getChatMessages('chat-1', { allowCacheFallback: false }), /Network request failed/);
  await assert.rejects(exportsObject.getChats({ allowCacheFallback: false }), /Network request failed/);
  const offlineMsgs = await exportsObject.getChatMessages('chat-1');
  assert.equal(offlineMsgs[0].id, 'cached-msg');
  const offlineChats = await exportsObject.getChats();
  assert.equal(offlineChats[0].id, 'cached-chat');

  let finishWarmUp;
  let warmUpCount = 0;
  nextFetchResponse = () => {
    warmUpCount++;
    return new Promise(resolve => { finishWarmUp = resolve; });
  };
  const warmUp = exportsObject.warmUpBackend();
  assert.equal(exportsObject.warmUpBackend(), warmUp, 'resume shares a pending warm-up');
  assert.equal(warmUpCount, 1);
  finishWarmUp({ ok: true, status: 200 });
  await warmUp;
  await exportsObject.warmUpBackendIfIdle();
  assert.equal(warmUpCount, 1, 'composer focus skips a recently healthy backend');
  const nextWarmUp = exportsObject.warmUpBackend();
  assert.equal(warmUpCount, 2, 'a later resume can start its own warm-up');
  finishWarmUp({ status: 200 });
  await nextWarmUp;
  testNow += 15 * 60 * 1000;
  const idleWarmUp = exportsObject.warmUpBackendIfIdle();
  assert.equal(warmUpCount, 3, 'composer focus after inactivity can wake the backend');
  finishWarmUp({ ok: true, status: 200 });
  await idleWarmUp;

  const history = new AbortController();
  let completeHistory;
  let historySignal;
  nextFetchResponse = (_url, options) => {
    historySignal = options.signal;
    return new Promise(resolve => { completeHistory = resolve; });
  };
  const pendingHistory = exportsObject.getChatMessages('chat-1', { signal: history.signal });
  pendingHistory.catch(() => {});
  await new Promise(resolve => setImmediate(resolve));
  history.abort();
  assert.equal(historySignal.aborted, true, 'history cancellation reaches fetch');
  completeHistory({ ok: true, status: 200, json: async () => ({ messages: [] }) });
  await assert.rejects(pendingHistory, /canceled/);
  assert.equal(cacheWrites, 0, 'canceled history cannot write a stale snapshot');

  console.log('PASS: streaming, replay, offline cache, warm-up deduplication, and history cancellation');
})().catch(error => { console.error(error); process.exitCode = 1; });
