import React, { useRef, useState } from "react";
import { useRouter } from "expo-router";
import { AuthButton, AuthField, AuthNotice, AuthScreen, AuthTextAction } from "../../components/AuthForm";
import { useAuth } from "../../lib/auth";
import { authErrorMessage, emailError, passwordError } from "../../lib/authForms";

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  const register = async () => {
    if (pending.current) return;
    setSubmitted(true); setError("");
    if (!name.trim() || emailError(email) || passwordError(password) || password !== confirmation) return;
    pending.current = true; setBusy(true);
    try {
      const result = await signUp(email.trim(), password, name.trim());
      setNeedsConfirmation(result.needsEmailConfirmation);
      setPassword(""); setConfirmation(""); setSubmitted(false);
      setSuccess(result.needsEmailConfirmation
        ? "Check your email for a confirmation link. After confirming, return here and sign in. If you already have an account, try signing in or resetting your password."
        : "Your account is ready. You can now sign in.");
    } catch (cause) { setError(authErrorMessage(cause, "Unable to create an account. Try signing in if you already registered, or try again later.")); }
    finally { pending.current = false; setBusy(false); }
  };

  return (
    <AuthScreen title={success ? "Almost there" : "Create your account"} subtitle="A place for your Philippine legal questions." footer={<>
      <AuthTextAction title="Already have an account? Sign in" disabled={busy} onPress={() => router.replace("/(auth)/login")} />
      <AuthTextAction title="Privacy notice" onPress={() => router.push("/(auth)/privacy-notice")} />
    </>}>
      {success ? <AuthNotice text={success} /> : <>
        <AuthField label="Full name" value={name} onChangeText={setName} placeholder="Your full name" autoCapitalize="words" autoComplete="name" textContentType="name" editable={!busy} error={submitted && !name.trim() ? "Enter your name." : undefined} />
        <AuthField label="Email" value={email} onChangeText={setEmail} placeholder="email@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" editable={!busy} error={submitted ? emailError(email) : undefined} />
        <AuthField label="Password" password value={password} onChangeText={setPassword} autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" editable={!busy} hint="Use at least 8 characters. A longer, unique passphrase is better." error={submitted ? passwordError(password) : undefined} />
        <AuthField label="Confirm password" password value={confirmation} onChangeText={setConfirmation} autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" returnKeyType="done" onSubmitEditing={() => { void register(); }} editable={!busy} error={submitted && password !== confirmation ? "Passwords do not match." : undefined} />
        <AuthNotice text={error} />
        <AuthButton title="Create account" busy={busy} onPress={() => { void register(); }} />
      </>}
      {!!success && needsConfirmation && <AuthTextAction title="Resend confirmation email" onPress={() => router.push({ pathname: "/(auth)/resend-confirmation", params: { email: email.trim() } })} />}
    </AuthScreen>
  );
}
