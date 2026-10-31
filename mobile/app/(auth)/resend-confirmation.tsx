import React, { useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AuthButton, AuthField, AuthNotice, AuthScreen, AuthTextAction } from "../../components/AuthForm";
import { authErrorMessage, emailError } from "../../lib/authForms";
import { resendSignupConfirmation } from "../../lib/confirmationEmail";

export default function ResendConfirmationScreen() {
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

  const resend = async () => {
    if (pending.current || cooldown) return;
    setSubmitted(true); setError("");
    if (emailError(email)) return;
    pending.current = true; setBusy(true);
    try { await resendSignupConfirmation(email); setSent(true); setCooldown(60); }
    catch (cause) { setError(authErrorMessage(cause, "We couldn't request a confirmation email. Please try again later.")); }
    finally { pending.current = false; setBusy(false); }
  };

  return (
    <AuthScreen title="Confirm your email" subtitle="Request another confirmation link for your Justif AI account.">
      <AuthField label="Email" value={email} onChangeText={(value) => { setEmail(value); setSent(false); }} placeholder="email@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" editable={!busy} returnKeyType="send" onSubmitEditing={() => { void resend(); }} error={submitted ? emailError(email) : undefined} />
      {sent && <AuthNotice text="If this address has an account waiting for confirmation, a new link will be sent. Check your inbox and spam folder. After confirming, return to the app and sign in." />}
      <AuthNotice text={error} />
      <AuthButton title={cooldown ? `Send again in ${cooldown}s` : "Resend confirmation email"} busy={busy} disabled={cooldown > 0} onPress={() => { void resend(); }} />
      <AuthTextAction title="Back to sign in" disabled={busy} onPress={() => router.replace("/(auth)/login")} />
      <AuthTextAction title="Privacy notice" onPress={() => router.push("/(auth)/privacy-notice")} />
    </AuthScreen>
  );
}
