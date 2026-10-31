export const MIN_PASSWORD_LENGTH = 8;

export function emailError(email: string): string | undefined {
  if (!email.trim()) return "Enter your email address.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Enter a valid email address.";
}

export function passwordError(password: string): string | undefined {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
}

export function authErrorMessage(error: unknown, fallback: string): string {
  const value = error as { code?: string; message?: string; status?: number } | undefined;
  if (value?.code === "invalid_credentials") return "Incorrect email or password. Please try again.";
  if (value?.code === "email_not_confirmed") return "Confirm your email before signing in. Check your inbox and spam folder.";
  if (value?.status === 429 || value?.code?.includes("rate_limit")) return "Too many attempts. Please wait a few minutes and try again.";
  if (value?.code === "weak_password") return "Choose a stronger password with at least 8 characters.";
  if (value?.code === "same_password") return "Choose a different password from your current one.";
  if (/network|failed to fetch|fetch failed/i.test(value?.message || "")) return "Unable to connect. Check your internet connection and try again.";
  return fallback;
}
