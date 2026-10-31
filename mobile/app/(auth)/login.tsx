import React, { useRef, useState } from "react";
import { useRouter } from "expo-router";
import { AuthButton, AuthField, AuthNotice, AuthScreen, AuthTextAction } from "../../components/AuthForm";
import { useAuth } from "../../lib/auth";
import { authErrorMessage, emailError } from "../../lib/authForms";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const login = async () => {
    if (pending.current) return;
    setSubmitted(true); setError("");
    if (emailError(email) || !password) return;
    pending.current = true; setBusy(true);
    try { await signIn(email.trim(), password); }
    catch (cause) { setError(authErrorMessage(cause, "Unable to sign in. Please check your details and try again.")); }
    finally { pending.current = false; setBusy(false); }
  };

  return (
    <AuthScreen title="Welcome back" subtitle="Sign in to continue your legal questions and conversations.">
      <AuthField label="Email" value={email} onChangeText={setEmail} placeholder="email@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" editable={!busy} error={submitted ? emailError(email) : undefined} />
      <AuthField label="Password" password value={password} onChangeText={setPassword} autoCapitalize="none" autoComplete="current-password" textContentType="password" returnKeyType="go" onSubmitEditing={() => { void login(); }} editable={!busy} error={submitted && !password ? "Enter your password." : undefined} />
      <AuthTextAction title="Forgot password?" disabled={busy} onPress={() => router.push({ pathname: "/(auth)/forgot-password", params: { email: email.trim() } })} />
      <AuthTextAction title="Resend confirmation email" disabled={busy} onPress={() => router.push({ pathname: "/(auth)/resend-confirmation", params: { email: email.trim() } })} />
      <AuthNotice text={error} />
      <AuthButton title="Sign in" busy={busy} onPress={() => { void login(); }} />
      <AuthTextAction title="New to Justif AI? Create an account" disabled={busy} onPress={() => router.push("/(auth)/register")} />
      <AuthTextAction title="Privacy notice" onPress={() => router.push("/(auth)/privacy-notice")} />
    </AuthScreen>
  );
}
