export function authDestination(hasSession: boolean, segments: readonly string[]) {
  const inAuth = segments[0] === "(auth)";
  if (inAuth && segments[1] === "privacy-notice") return null;
  if (!hasSession && !inAuth) return "/(auth)/login" as const;
  if (hasSession && inAuth && segments[1] !== "reset-password") return "/(main)/chat" as const;
  return null;
}
