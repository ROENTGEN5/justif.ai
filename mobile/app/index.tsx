/**
 * Entry Point Redirect
 * Expo Router requires an index file.
 * The root _layout handles the actual redirect logic.
 */

import { Redirect } from "expo-router";
import { useAuth } from "../lib/auth";

export default function Index() {
  const { session } = useAuth();

  if (session) {
    return <Redirect href="/(main)/chat" />;
  }

  return <Redirect href="/(auth)/login" />;
}
