import { supabase } from "./supabase";
import { clearConversationCaches } from "./conversationCache";
import { passwordError } from "./authForms";

export const PASSWORD_RESET_REDIRECT = "justifai://reset-password";

export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: PASSWORD_RESET_REDIRECT,
  });
  // Keep the response neutral for addresses that are not registered.
  if (error && error.code !== "user_not_found") throw error;
}

export async function verifyRecoveryCode(code: string) {
  if (!code.trim()) throw new Error("Missing recovery code");
  let recoveredUserId = "";
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") recoveredUserId = session?.user.id || "";
  });
  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    if (!data.session || !data.user || recoveredUserId !== data.user.id) {
      await supabase.auth.signOut({ scope: "local" });
      throw new Error("Not a password recovery session");
    }
    return data.user.id;
  } finally {
    subscription.unsubscribe();
  }
}

export async function saveRecoveredPassword(password: string, expectedUserId: string) {
  const validationError = passwordError(password);
  if (validationError) throw new Error(validationError);
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!expectedUserId || data.user?.id !== expectedUserId) throw new Error("Recovery session changed");
  const result = await supabase.auth.updateUser({ password });
  if (result.error) throw result.error;
}

export async function closeRecoverySession() {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  await clearConversationCaches();
  if (error) throw error;
}
