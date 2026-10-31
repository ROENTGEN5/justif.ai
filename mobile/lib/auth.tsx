import { clearConversationCaches } from "./conversationCache";
/**
 * Authentication Context & Provider
 * Manages Supabase auth state across the app.
 * Supports email/password authentication.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { Alert } from "react-native";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import Strings from "../constants/Strings";
import { createSessionLoader } from "./sessionLoader";
import { passwordError } from "./authForms";
// ─── Types ──────────────────────────────────────────────────

interface AuthContextType {
  /** The current Supabase session (null if not authenticated) */
  session: Session | null;
  /** The current authenticated user (null if not authenticated) */
  user: User | null;
  /** Whether auth state is still loading */
  isLoading: boolean;
  sessionError: string | null;
  retrySession: () => void;
  /** Sign in with email and password */
  signIn: (email: string, password: string) => Promise<void>;
  /** Register a new account */
  signUp: (
    email: string,
    password: string,
    fullName: string
  ) => Promise<{ needsEmailConfirmation: boolean }>;
  /** Sign out and clear session */
  signOut: () => Promise<void>;
}

// ─── Context ────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  isLoading: true,
  sessionError: null,
  retrySession: () => {},
  signIn: async () => {},
  signUp: async () => ({ needsEmailConfirmation: false }),
  signOut: async () => {},
});

// ─── Provider ───────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [sessionError, setSessionError] = useState<string | null>(null);
  const sessionLoader = useRef<{ start: () => void; cancel: () => void } | null>(null);
  const retrySession = useCallback(() => sessionLoader.current?.start(), []);
  const isRegisteringRef = useRef(false);

  useEffect(() => {
    let active = true;
    const applySession = (nextSession: Session | null) => {
      if (!active) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setSessionError(null);
      setIsLoading(false);
    };
    const loader = createSessionLoader<Session>({
      load: () => supabase.auth.getSession(),
      loading: () => { if (active) { setSessionError(null); setIsLoading(true); } },
      ready: applySession,
      failed: (message) => { if (active) { setSessionError(message); setIsLoading(false); } },
    });
    sessionLoader.current = loader;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // Startup must use getSession's result, including errors; a null initial
      // event must not turn a failed refresh into a signed-out screen.
      if (event === "INITIAL_SESSION" || !active) return;
      if (event === "SIGNED_OUT") setTimeout(() => { void clearConversationCaches(); }, 0);
      if (isRegisteringRef.current && nextSession) return;
      // A newer sign-in/sign-out/refresh supersedes an older pending restore.
      loader.cancel();
      applySession(nextSession);
    });
    loader.start();
    return () => {
      active = false;
      loader.cancel();
      if (sessionLoader.current === loader) sessionLoader.current = null;
      subscription.unsubscribe();
    };
  }, []);

  // Sign in with email/password
  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      throw error;
    }
  }, []);

  // Sign up with email/password
  const signUp = useCallback(
    async (email: string, password: string, fullName: string) => {
      const validationError = passwordError(password);
      if (validationError) throw new Error(validationError);
      isRegisteringRef.current = true;
      try {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: "justifai://login",
            data: {
              full_name: fullName.trim(),
            },
          },
        });

        if (error) {
          throw error;
        }

        // If auto-logged in, sign out immediately
        if (data?.session) {
          await supabase.auth.signOut({ scope: "local" });
        }
        return { needsEmailConfirmation: !data.session };
      } finally {
        isRegisteringRef.current = false;
      }
    },
    []
  );

  // Sign out
  const signOut = useCallback(async () => {
    Alert.alert(Strings.signOut, Strings.signOutConfirm, [
      { text: Strings.cancel, style: "cancel" },
      {
        text: Strings.confirm,
        style: "destructive",
        onPress: async () => {
          await clearConversationCaches();
          const { error } = await supabase.auth.signOut();
          await clearConversationCaches();
          if (error) {
            Alert.alert("Error", error.message);
          }
        },
      },
    ]);
  }, []);

  return (
    <AuthContext.Provider
      value={{ session, user, isLoading, sessionError, retrySession, signIn, signUp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export default AuthProvider;
