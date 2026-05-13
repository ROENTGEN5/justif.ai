/**
 * Justif.ai — English UI Strings
 * "Your AI Legal Assistant"
 *
 * All user-facing text in clear, professional English.
 */

export const Strings = {
  // ─── App Branding ────────────────────────────────────
  appName: "Justif.ai",
  tagline: "Your AI Legal Assistant",
  welcome: "Welcome!",
  welcomeSubtitle: "I'm Justif.ai, your AI-powered legal assistant.",

  // ─── Auth ────────────────────────────────────────────
  login: "Sign In",
  loginTitle: "Welcome Back",
  loginSubtitle: "Sign in to ask about the law.",
  register: "Register",
  registerTitle: "Create Account",
  registerSubtitle: "Join Justif.ai today!",
  email: "Email",
  password: "Password",
  fullName: "Full Name",
  confirmPassword: "Confirm Password",
  forgotPassword: "Forgot password?",
  noAccount: "Don't have an account?",
  hasAccount: "Already have an account?",
  signingIn: "Signing in...",
  registering: "Registering...",

  // ─── Chat ────────────────────────────────────────────
  chatWelcome:
    "Hello! What legal concern can I help you with today?",
  chatPlaceholder: "Type your question here...",
  send: "Send",
  thinking: "Justif.ai is thinking...",
  newChat: "New Chat",
  chatHistory: "Chat History",
  noChats: "You don't have any conversations yet.",
  deleteChat: "Delete Conversation",
  deleteChatConfirm: "Are you sure you want to delete this conversation?",

  // ─── Drawer / Navigation ────────────────────────────
  signOut: "Sign Out",
  signOutConfirm: "Are you sure you want to sign out?",
  profile: "Profile",
  settings: "Settings",
  about: "About Justif.ai",
  appearance: "Appearance",
  lightMode: "Light",
  darkMode: "Dark",
  nightMode: "Night",

  // ─── Errors ──────────────────────────────────────────
  errorGeneric: "Something went wrong. Please try again.",
  errorNetwork: "No internet connection. Please check your connection.",
  errorAuth: "Incorrect email or password. Please try again.",
  errorRegister: "Registration failed. Please try again.",
  errorMessageSend: "Failed to send message. Please try again.",

  // ─── Success ─────────────────────────────────────────
  successRegister: "Registration successful! Please sign in.",
  successSignOut: "You have been signed out successfully.",

  // ─── Misc ────────────────────────────────────────────
  cancel: "Cancel",
  confirm: "Confirm",
  ok: "OK",
  loading: "Loading...",
  retry: "Try Again",
  show: "Show",
  hide: "Hide",

  // ─── RAG / Sources ──────────────────────────────────
  sources: "Sources",
  filterLabel: "Filter by law type:",
  filterAll: "All",
  filterClear: "Clear filter",
  ragSearching: "Searching for relevant laws...",
  noSourcesFound: "No specific laws found for this query.",
} as const;

export default Strings;
