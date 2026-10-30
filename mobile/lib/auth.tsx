import { clearConversationCaches } from "./conversationCache";
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
import {
  GoogleSignin,
  statusCodes,
  isErrorWithCode,
  isSuccessResponse,
} from "@react-native-google-signin/google-signin";

// ─── Configure Google Sign-In ───────────────────────────────

const getWebClientId = () => {
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!clientId || clientId === "YOUR_GOOGLE_WEB_CLIENT_ID_HERE") {
    return null;
  }
  return clientId;
};

// Initial configuration if client ID is set
const initialClientId = getWebClientId();
if (initialClientId) {
  try {
    GoogleSignin.configure({
      webClientId: initialClientId,
      offlineAccess: true,
    });
  } catch (e) {
    console.warn("[AuthProvider] Failed to configure GoogleSignin at startup:", e);
  }
}

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

  const isRegisteringRef = useRef(false);

  // Listen for auth state changes
  useEffect(() => {
    let isMounted = true;

    console.log("[AuthProvider] Starting auth init...");

    // Safety timeout — if auth takes too long, stop loading anyway
    // (Reduced from 15s to 3s so the user never gets stuck on a long loading screen)
    const timeout = setTimeout(() => {
      console.warn("[AuthProvider] TIMEOUT fired — forcing isLoading to false");
      if (isMounted) {
        setIsLoading(false);
      }
    }, 3000);

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
      if (_event === "SIGNED_OUT") setTimeout(() => { void clearConversationCaches(); }, 0);
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
    try {
      const webClientId = getWebClientId();
      if (!webClientId) {
        throw new Error(
          "Google Web Client ID is not configured. Please set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in your mobile/.env file."
        );
      }

      // Ensure GoogleSignin is configured with the web client ID
      GoogleSignin.configure({
        webClientId,
        offlineAccess: true,
      });

      // Check if Google Play Services are available
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      // Trigger native Google Sign-In prompt
      const response = await GoogleSignin.signIn();

      if (!isSuccessResponse(response)) {
        // User cancelled or dismissed sign-in
        return;
      }

      const idToken = response.data.idToken;
      if (!idToken) {
        throw new Error("No ID token received from Google.");
      }

      // Sign in to Supabase using the Google ID token
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: idToken,
      });

      if (error) {
        throw new Error(error.message);
      }
    } catch (error: any) {
      if (isErrorWithCode(error)) {
        if (error.code === statusCodes.SIGN_IN_CANCELLED) {
          // User cancelled — silently return
          return;
        } else if (error.code === statusCodes.IN_PROGRESS) {
          // Sign-in already in progress
          return;
        } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          throw new Error(
            "Google Play Services is not available or outdated on this device."
          );
        }
      }

      // Fallback message if native module is missing (e.g. running in Expo Go)
      if (
        error?.message?.includes("TurboModuleRegistry") ||
        error?.message?.includes("RNGoogleSignin")
      ) {
        throw new Error(
          "Google Sign-In native module not found. Please run this app using an Expo Development Build, not Expo Go."
        );
      }

      throw error;
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
            const currentUser = GoogleSignin.getCurrentUser();
            if (currentUser) {
              await GoogleSignin.signOut();
            }
          } catch (e) {
            // Ignore Google sign-out errors (e.g. user was not logged into Google)
          }

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
