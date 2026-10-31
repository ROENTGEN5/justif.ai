// Recovery behavior tests use a fake auth server; no emails or accounts are created.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');

function load(file, dependencies = {}, globals = {}) {
  const exports = {};
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(output, { exports, ...globals, require: (name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`);
    return dependencies[name];
  } });
  return exports;
}

async function main() {
  const forms = load('lib/authForms.ts');
  assert.equal(forms.emailError('  person@example.com  '), undefined);
  for (const email of ['', 'bad', 'a b@example.com', 'person@']) assert.ok(forms.emailError(email));
  assert.ok(forms.passwordError('1234567'));
  assert.equal(forms.passwordError('long passphrase'), undefined);
  assert.match(forms.authErrorMessage({ code: 'email_not_confirmed' }, 'fallback'), /Confirm your email/);
  assert.equal(forms.authErrorMessage({ message: 'internal secret configuration' }, 'Safe error'), 'Safe error');
  const routing = load('lib/authRouting.ts');
  assert.equal(routing.authDestination(false, ['(main)', 'chat']), '/(auth)/login');
  assert.equal(routing.authDestination(false, ['(auth)', 'forgot-password']), null);
  assert.equal(routing.authDestination(true, ['(auth)', 'reset-password']), null);
  assert.equal(routing.authDestination(true, ['(auth)', 'login']), '/(main)/chat');
  assert.equal(routing.authDestination(false, ['(auth)', 'privacy-notice']), null);
  assert.equal(routing.authDestination(true, ['(auth)', 'privacy-notice']), null);
  assert.equal(routing.authDestination(false, ['(main)', 'privacy']), '/(auth)/login');

  let callback, unsubscribed = 0, signedOut = 0, updated = 0, cleared = 0;
  let recoveryEvent = true, invalidCode = false, accountId = 'alice';
  const auth = {
    async resetPasswordForEmail(email, options) {
      assert.equal(email, 'person@example.com');
      assert.equal(options.redirectTo, 'justifai://reset-password');
      return { error: null };
    },
    onAuthStateChange(listener) {
      callback = listener;
      return { data: { subscription: { unsubscribe() { unsubscribed++; } } } };
    },
    async exchangeCodeForSession() {
      if (invalidCode) return { data: {}, error: new Error('Expired code') };
      const user = { id: 'alice' }, session = { user };
      callback(recoveryEvent ? 'PASSWORD_RECOVERY' : 'SIGNED_IN', session);
      return { data: { user, session }, error: null };
    },
    async getUser() { return { data: { user: { id: accountId } }, error: null }; },
    async updateUser({ password }) { assert.equal(password, 'long passphrase'); updated++; return { error: null }; },
    async signOut(options) { assert.equal(options.scope, 'local'); signedOut++; return { error: null }; },
  };
  const recovery = load('lib/passwordRecovery.ts', {
    './supabase': { supabase: { auth } },
    './conversationCache': { clearConversationCaches: async () => { cleared++; } },
    './authForms': forms,
  });
  await recovery.requestPasswordReset(' person@example.com ');
  assert.equal(await recovery.verifyRecoveryCode('valid-code'), 'alice');
  assert.equal(unsubscribed, 1);
  await recovery.saveRecoveredPassword('long passphrase', 'alice');
  assert.equal(updated, 1);
  await assert.rejects(recovery.saveRecoveredPassword('short', 'alice'), /at least 8/);
  assert.equal(updated, 1, 'Short passwords must not reach the update API');
  accountId = 'bob';
  await assert.rejects(recovery.saveRecoveredPassword('long passphrase', 'alice'), /session changed/);
  assert.equal(updated, 1, 'Account switches must not update another account');
  recoveryEvent = false;
  await assert.rejects(recovery.verifyRecoveryCode('signup-code'), /Not a password recovery/);
  assert.equal(signedOut, 1, 'A normal sign-in code must not unlock password reset');
  invalidCode = true;
  await assert.rejects(recovery.verifyRecoveryCode('expired'), /Expired/);
  assert.equal(unsubscribed, 3);
  await assert.rejects(recovery.verifyRecoveryCode(''), /Missing/);
  await recovery.closeRecoverySession();
  assert.equal(cleared, 1);
  auth.resetPasswordForEmail = async () => ({ error: { code: 'user_not_found' } });
  await recovery.requestPasswordReset('unknown@example.com');
  auth.resetPasswordForEmail = async () => ({ error: { code: 'over_email_send_rate_limit' } });
  await assert.rejects(recovery.requestPasswordReset('person@example.com'));

  let resendCalls = 0;
  auth.resend = async (request) => {
    assert.equal(request.type, 'signup');
    assert.equal(request.email, 'person@example.com');
    assert.equal(request.options.emailRedirectTo, 'justifai://login');
    assert.equal(request.password, undefined);
    resendCalls++;
    return { error: null };
  };
  const confirmations = load('lib/confirmationEmail.ts', { './supabase': { supabase: { auth } } });
  await confirmations.resendSignupConfirmation(' person@example.com ');
  assert.equal(resendCalls, 1);
  for (const code of ['user_not_found', 'email_already_confirmed']) {
    auth.resend = async () => ({ error: { code } });
    await confirmations.resendSignupConfirmation('person@example.com');
  }
  auth.resend = async () => ({ error: { code: 'over_email_send_rate_limit' } });
  await assert.rejects(confirmations.resendSignupConfirmation('person@example.com'));

  // Deterministic timers: no real waiting or network calls.
  let timerId = 0;
  const timers = new Map();
  const { createSessionLoader } = load('lib/sessionLoader.ts', {}, {
    setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; },
    clearTimeout: (id) => timers.delete(id),
  });
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const events = [];
  const requests = [];
  const loader = createSessionLoader({
    load: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
    loading: () => events.push('loading'),
    ready: (session) => events.push(session?.user || 'signed-out'),
    failed: () => events.push('error'),
  });
  loader.start(); await flush();
  assert.deepEqual(events, ['loading'], 'Pending restore must not become signed-out');
  [...timers.values()][0]();
  assert.deepEqual(events, ['loading', 'error']);
  requests[0].resolve({ data: { session: null }, error: null }); await flush();
  assert.deepEqual(events, ['loading', 'error'], 'Timed-out request must not overwrite the retry screen');
  loader.start(); await flush();
  loader.start(); await flush();
  requests[2].resolve({ data: { session: { user: 'alice' } }, error: null }); await flush();
  requests[1].resolve({ data: { session: null }, error: null }); await flush();
  assert.equal(events.at(-1), 'alice', 'Older restore must not overwrite a newer session');
  loader.start(); await flush(); loader.cancel();
  requests[3].resolve({ data: { session: null }, error: null }); await flush();
  assert.equal(events.at(-1), 'loading', 'Cancelled restore must not overwrite a newer auth event');
  assert.equal(timers.size, 0);
  loader.start(); await flush();
  requests[4].resolve({ data: { session: null }, error: { message: 'offline' } }); await flush();
  assert.equal(events.at(-1), 'error', 'SDK errors must not be treated as signed-out');
  loader.start(); await flush(); requests[5].reject(new Error('network')); await flush();
  assert.equal(events.at(-1), 'error');
  loader.start(); await flush(); requests[6].resolve({ data: { session: null }, error: null }); await flush();
  assert.equal(events.at(-1), 'signed-out', 'Only a successful empty restore permits sign-in routing');
  assert.equal(timers.size, 0);
  console.log('PASS: auth validation, public privacy routing, signup confirmation resend, password recovery, safe errors, session timeout/retry/races, and cleanup');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
