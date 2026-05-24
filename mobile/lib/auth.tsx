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
} from "react";
import { Alert } from "react-native";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import Strings from "../constants/Strings";
import {
  GoogleSignin,
  statusCodes,
} from "@react-native-google-signin/google-signin";

// ─── Configure Google Sign-In ───────────────────────────────

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "",
  offlineAccess: true,
});

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
    const timeout = setTimeout(() => {
      console.warn("[AuthProvider] TIMEOUT fired — forcing isLoading to false");
      if (isMounted) {
        setIsLoading(false);
      }
    }, 5000);

    // Get initial session
    console.log("[AuthProvider] Calling getSession()...");
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        console.log("[AuthProvider] getSession resolved, session:", !!session);
        if (isMounted) {
          setSession(session);
          setUser(session?.user ?? null);
          setIsLoading(false);
        }
      })
      .catch((error) => {
        console.error("[AuthProvider] getSession error:", error);
        if (isMounted) {
          setIsLoading(false);
        }
      });

    // Subscribe to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log("[AuthProvider] onAuthStateChange:", _event, "session:", !!session);
      if (isMounted) {
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

  // Sign in with Google (native)
  const signInWithGoogle = useCallback(async () => {
    try {
      // Check if Google Play Services are available
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      // Trigger Google Sign-In
      const signInResult = await GoogleSignin.signIn();

      // Get the ID token from the sign-in result
      const idToken = signInResult?.data?.idToken;

      if (!idToken) {
        throw new Error("No ID token received from Google.");
      }

      // Sign in to Supabase with the Google ID token
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: idToken,
      });

      if (error) {
        throw new Error(error.message);
      }
    } catch (error: any) {
      // Handle specific Google Sign-In errors
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        // User cancelled — silently return
        return;
      } else if (error.code === statusCodes.IN_PROGRESS) {
        // Sign-in already in progress
        return;
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error("Google Play Services is not available on this device.");
      } else {
        throw error;
      }
    }
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
          try {
            const isSignedIn = GoogleSignin.getCurrentUser();
            if (isSignedIn) {
              await GoogleSignin.signOut();
            }
          } catch (e) {
            // Ignore Google sign-out errors
          }

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
