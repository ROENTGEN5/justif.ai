import React, { useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AuthButton, AuthField, AuthNotice, AuthScreen, AuthTextAction } from "../../components/AuthForm";
import { authErrorMessage, passwordError } from "../../lib/authForms";
import { closeRecoverySession, saveRecoveredPassword, verifyRecoveryCode } from "../../lib/passwordRecovery";

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ code?: string; error?: string }>();
  const code = typeof params.code === "string" ? params.code : "";
  return <RecoveryForm key={code} code={code} />;
}

function RecoveryForm({ code }: { code: string }) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  // Reuse the exchange during React effect replays; the code is single-use.
  const exchange = useRef<{ code: string; promise: Promise<string> } | null>(null);

  useEffect(() => {
    let active = true;
    if (!exchange.current || exchange.current.code !== code) {
      exchange.current = { code, promise: verifyRecoveryCode(code) };
    }
    exchange.current.promise.then((id) => { if (active) setUserId(id); })
      .catch((cause) => { if (active) setError(authErrorMessage(cause, "This reset link is invalid, expired, already used, or was requested on another device. Please request a new link.")); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [code]);

  const save = async () => {
    if (pending.current || !userId || checking || saved) return;
    setSubmitted(true); setError("");
    if (passwordError(password) || password !== confirmation) return;
    pending.current = true; setBusy(true);
    try {
      await saveRecoveredPassword(password, userId);
      setPassword(""); setConfirmation(""); setSaved(true);
      await closeRecoverySession();
      setUserId("");
    } catch (cause) { setError(authErrorMessage(cause, "Unable to complete the password reset. Please try again or request a new link.")); }
    finally { pending.current = false; setBusy(false); }
  };

  const leave = async (requestNew = false) => {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try {
      if (userId) await closeRecoverySession();
      router.replace(requestNew ? "/(auth)/forgot-password" : "/(auth)/login");
    } catch { setError("Unable to close the reset session. Please try again."); }
    finally { pending.current = false; setBusy(false); }
  };

  return (
    <AuthScreen title={saved ? "Password updated" : !checking && !userId ? "Reset link unavailable" : "Choose a new password"} subtitle={checking ? "Checking your reset link..." : saved ? "Your new password is saved. Sign in to continue." : !userId ? "Request a new link to reset your password." : "Use a unique password that you haven't used elsewhere."}>
      {checking ? <AuthButton title="Checking reset link" busy onPress={() => {}} /> : userId && !saved ? <>
        <AuthField label="New password" password value={password} onChangeText={setPassword} autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" editable={!busy} hint="Use at least 8 characters." error={submitted ? passwordError(password) : undefined} />
        <AuthField label="Confirm new password" password value={confirmation} onChangeText={setConfirmation} autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" editable={!busy} returnKeyType="done" onSubmitEditing={() => { void save(); }} error={submitted && password !== confirmation ? "Passwords do not match." : undefined} />
        <AuthButton title="Save new password" busy={busy} onPress={() => { void save(); }} />
      </> : null}
      <AuthNotice text={error} />
      {!checking && !userId && !saved && <AuthTextAction title="Request a new reset link" disabled={busy} onPress={() => { void leave(true); }} />}
      <AuthTextAction title={saved ? "Sign in" : "Cancel and return to sign in"} disabled={busy || checking} onPress={() => { void leave(); }} />
    </AuthScreen>
  );
}
