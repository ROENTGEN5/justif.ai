import React, { useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AuthButton, AuthField, AuthNotice, AuthScreen, AuthTextAction } from "../../components/AuthForm";
import { authErrorMessage, emailError } from "../../lib/authForms";
import { requestPasswordReset } from "../../lib/passwordRecovery";

export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const router = useRouter();
  const [email, setEmail] = useState(typeof params.email === "string" ? params.email : "");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [submitted, setSubmitted] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const send = async () => {
    if (pending.current || cooldown) return;
    setSubmitted(true); setError("");
    if (emailError(email)) return;
    pending.current = true; setBusy(true);
    try { await requestPasswordReset(email); setSent(true); setCooldown(60); }
    catch (cause) { setError(authErrorMessage(cause, "We couldn't request a reset email. Please try again later.")); }
    finally { pending.current = false; setBusy(false); }
  };

  return (
    <AuthScreen title="Reset your password" subtitle="Enter the email address you used to register.">
      <AuthField label="Email" value={email} onChangeText={(value) => { setEmail(value); setSent(false); }} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" placeholder="email@example.com" returnKeyType="send" editable={!busy} onSubmitEditing={() => { void send(); }} error={submitted ? emailError(email) : undefined} />
      {sent && <AuthNotice text="If an account exists for that address, you'll receive a reset link. Check your inbox and spam folder. Open the latest link on this device in Justif AI, where you requested it." />}
      <AuthNotice text={error} />
      <AuthButton title={cooldown ? `Send again in ${cooldown}s` : sent ? "Resend reset email" : "Send reset email"} busy={busy} disabled={cooldown > 0} onPress={() => { void send(); }} />
      <AuthTextAction title="Back to sign in" disabled={busy} onPress={() => router.replace("/(auth)/login")} />
    </AuthScreen>
  );
}
