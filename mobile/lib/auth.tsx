/**
 * Authentication Context & Provider
 * Manages Supabase auth state across the app.
 * Supports email/password and Google Sign-In.
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
// import {
//   GoogleSignin,
//   statusCodes,
// } from "@react-native-google-signin/google-signin";

// ─── Configure Google Sign-In ───────────────────────────────

// GoogleSignin.configure({
//   webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "",
//   offlineAccess: true,
// });

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
  /** Sign in with Google */
  signInWithGoogle: () => Promise<void>;
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
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

// ─── Provider ───────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Listen for auth state changes
  useEffect(() => {
    let isMounted = true;

    console.log("[AuthProvider] Starting auth init...");

    // Safety timeout — if auth takes too long, stop loading anyway
    // (15s to accommodate slower mobile networks)
    const timeout = setTimeout(() => {
      console.warn("[AuthProvider] TIMEOUT fired — forcing isLoading to false");
      if (isMounted) {
        setIsLoading(false);
      }
    }, 15000);

    // Get initial session
    console.log("[AuthProvider] Calling getSession()...");
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        console.log("[AuthProvider] getSession resolved, session:", !!session);
        clearTimeout(timeout);
        if (isMounted) {
          setSession(session);
          setUser(session?.user ?? null);
          setIsLoading(false);
        }
      })
      .catch((error) => {
        console.error("[AuthProvider] getSession error:", error);
        clearTimeout(timeout);
        if (isMounted) {
          setIsLoading(false);
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log("[AuthProvider] onAuthStateChange:", _event, "session:", !!session);
      if (isMounted) {
        // If we are artificially signing out immediately after registration to prevent auto-login,
        // we might not want to immediately broadcast the session if we're just going to destroy it.
        // However, Supabase forces this event. We will let it pass, but if `isRegisteringRef.current` is true,
        // we will IGNORE the session update to prevent the _layout from flashing the main screen.
        if (isRegisteringRef.current && session) {
           console.log("[AuthProvider] Ignoring session because isRegisteringRef is true");
           return;
        }

        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const isRegisteringRef = useRef(false);

  // Sign in with email/password
  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      throw new Error(error.message);
    }
  }, []);

  // Sign up with email/password
  const signUp = useCallback(
    async (email: string, password: string, fullName: string) => {
      isRegisteringRef.current = true;
      try {
        const { data, error } = await supabase.auth.signUp({
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

        // If auto-logged in, sign out immediately
        if (data?.session) {
          await supabase.auth.signOut();
        }
      } finally {
        isRegisteringRef.current = false;
      }
    },
    []
  );

  // Sign in with Google (native)
  const signInWithGoogle = useCallback(async () => {
    Alert.alert(
      "Not Available in Expo Go",
      "Google Sign-In requires native modules that are not included in Expo Go. Please use a development build to test this feature, or use Email/Password sign in for now."
    );
    return;
  }, []);

  // Sign out
  const signOut = useCallback(async () => {
    Alert.alert(Strings.signOut, Strings.signOutConfirm, [
      { text: Strings.cancel, style: "cancel" },
      {
        text: Strings.confirm,
        style: "destructive",
        onPress: async () => {
          // Also sign out of Google if signed in
          // try {
          //   const isSignedIn = GoogleSignin.getCurrentUser();
          //   if (isSignedIn) {
          //     await GoogleSignin.signOut();
          //   }
          // } catch (e) {
          //   // Ignore Google sign-out errors
          // }

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
      value={{ session, user, isLoading, signIn, signUp, signInWithGoogle, signOut }}
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
