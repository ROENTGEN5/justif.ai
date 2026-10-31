import { supabase } from "./supabase";

export async function resendSignupConfirmation(email: string) {
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: email.trim(),
    options: { emailRedirectTo: "justifai://login" },
  });
  // Do not disclose whether an address exists or is already confirmed.
  if (error && !["user_not_found", "email_already_confirmed"].includes(error.code || "")) throw error;
}
