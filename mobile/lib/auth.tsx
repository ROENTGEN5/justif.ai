/**
 * Authentication Context & Provider
 * Manages Supabase auth state across the app.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { Alert } from "react-native";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import Strings from "../constants/Strings";

// ─── Types ──────────────────────────────────────────────────

interface AuthContextType {
  /** The current Supabase session (null if not authenticated) */
  session: Session | null;
  /** The current authenticated user (null if not authenticated) */
  user: User | null;
  /** Whether auth state is still loading */
  isLoading: boolean;
  /** Sign in with email and password */
  signIn: (email: string, password: string) => Promise<void>;
  /** Register a new account */
  signUp: (
    email: string,
    password: string,
    fullName: string
  ) => Promise<void>;
  /** Sign out and clear session */
  signOut: () => Promise<void>;
}

// ─── Context ────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  isLoading: true,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
});

// ─── Provider ───────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Listen for auth state changes
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    // Subscribe to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Sign in
  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      throw new Error(error.message);
    }
  }, []);

  // Sign up
  const signUp = useCallback(
    async (email: string, password: string, fullName: string) => {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
        },
      });

      if (error) {
        throw new Error(error.message);
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
          const { error } = await supabase.auth.signOut();
          if (error) {
            Alert.alert("Error", error.message);
          }
        },
      },
    ]);
  }, []);

  return (
    <AuthContext.Provider
      value={{ session, user, isLoading, signIn, signUp, signOut }}
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
