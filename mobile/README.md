# Justif AI mobile app

The app uses email/password authentication through Supabase. Google sign-in has been removed.

## Run and build

From this directory:

```powershell
npm install
npm start
# Installable Android APK:
eas build --platform android --profile preview-arm64
```

## Password recovery setup (Supabase Dashboard)

1. Under Authentication > URL Configuration > Redirect URLs, allow `justifai://reset-password` and `justifai://login`. Both were saved and verified after reload on 31 October 2026. Site URL was also changed from `http://localhost:3000` to `justifai://login` and verified.
2. The current Supabase SDK can append callback query parameters. If the exact redirect entries reject them, add `justifai://reset-password**` and `justifai://login**` scoped to those paths, rather than an unrestricted app-wide wildcard.
3. Under Authentication > Email Templates, keep the reset-password link pointed at `{{ .ConfirmationURL }}`. Both live signup and reset templates were verified to use this placeholder on 31 October 2026. The app requests its own reset redirect; a hard-coded website link will break recovery.
4. Custom SMTP was verified disabled on 31 October 2026; a provider has not been chosen. Configure custom SMTP for real users. Supabase's built-in mail service is restricted to organization team addresses and is unsuitable for general signups or password recovery. Check sender verification and deliverability with the chosen mail provider.
5. In the Supabase project, open Authentication > Sign In / Providers > Email (Auth email/password settings), set Minimum password length to `8`, and save. Verified in the hosted dashboard on 31 October 2026 (Asia/Manila): changed from 6 to 8, saved, and read back after reopening Email settings. It matches the new-account/reset forms and service checks. Existing passwords are not rejected by the sign-in form based on length.
6. If email confirmation is enabled, verify the confirmation template also uses `{{ .ConfirmationURL }}` and that `justifai://login` is allowed.

Recovery uses PKCE and the verifier stored on the requesting device. Request the email and open the latest reset link on the same device and app installation. Opening an old link, reinstalling the app, clearing storage, or using another device may require requesting a new link.

A recovery link must establish a PASSWORD_RECOVERY session before the password fields are shown. Opening the reset screen directly or providing an ordinary signup/sign-in code does not unlock the form. After saving or pressing Cancel, the temporary local recovery session is closed. Backend Supabase policies remain responsible for rate limits and password enforcement; the UI countdown is only a usability aid.

Draft email bodies and a live-setup acceptance record are in `auth-email-templates/`. They have not been applied to Supabase.

## Confirmation-email resend and public privacy

Login has a Resend confirmation email link. Registration shows the same action when confirmation is required. It calls Supabase's signup-resend endpoint with `justifai://login`, shows a neutral message, and disables repeated requests for 60 seconds. The UI countdown does not replace Supabase's server rate limits. Email delivery still depends on the SMTP/template/redirect setup above.

`justifai://privacy-notice` opens the shared privacy notice before sign-in. Login and registration include this link; the existing signed-in privacy page uses the same component. This public route also remains available when session restoration cannot complete.

## Session loading and retry

Startup waits for the stored-session result. A failure or a 12-second timeout shows a retry screen with connection guidance, rather than assuming the user signed out. Late results from timed-out, cancelled, or older attempts are ignored. A newer auth event supersedes a pending restore. Successfully restored sessions may still work offline when supported by the existing local cache; this is not a claim that remote login works without a connection.

## Checks

### Drawer performance

The drawer memoizes filtered/grouped history, formatted timestamps, and individual rows. Unchanged history keeps its previous array, and navigator state objects are not passed into the drawer content. Gesture/transition events defer data updates until movement ends. Chat/profile loading starts after opening finishes, with cached history shown first. No animation duration was shortened, and no polling or additional runtime dependency was added.

Run `node scripts/test-drawer.cjs` for update deferral, latest-update coalescing, close handling, disposal, and account isolation. Before release, check repeated open/close, interrupted swipes, long history, search, theme switching, and pull-to-refresh in a release APK on a lower-end Android phone. Unit checks do not measure frame rate.

### Pull-to-refresh

At the top of a conversation or the drawer's chat-history list, pull down and release to fetch fresh data. The empty chat welcome screen also supports refresh. Normal upward scrolling does not make network requests.

Refresh keeps existing content, drafts, language, and filter selections. It is blocked during answer generation or an unresolved failed request, and briefly disables sending while history refreshes. A failed refresh shows connection guidance without treating cached data as a fresh response. Initial/offline loading still supports the existing cache fallback. Results from a previous chat or an unmounted screen are ignored.

Native acceptance: test long, short, and empty conversations; pull twice quickly; refresh offline; navigate away during refresh; verify draft retention and that the list stays at the top. Android/iOS pull gestures require a device check.

Run `node scripts/test-refresh.cjs` for request coordination, failure, retry, and stale-response checks.

```powershell
npx tsc --noEmit
npm run lint
node scripts/test-auth.cjs
node scripts/test-cache.cjs
```

Run `npm start` once after adding routes to regenerate Expo Router's ignored local type declarations.

## Device acceptance checks

- Register with confirmations enabled, confirm email, return to the app, then sign in.
- Register with confirmations disabled and verify the immediate sign-in guidance.
- Request a password reset on the installed APK; open its email link on that device; save a new password; sign in with the new password.
- Resend a signup confirmation, verify the cooldown and neutral response, then confirm and sign in.
- Open the privacy notice from login and registration while signed out; return to the originating screen.
- Check startup with slow/offline session refresh, retry after reconnection, and verify a late restore cannot replace a newer sign-in or sign-out.
- Check expired/reused links, a direct reset-screen visit, a different-device link, mismatched passwords, offline requests, email rate limits, and account changes while a reset form is open.
- Check the keyboard, autofill, show/hide toggles, screen-reader labels, larger system fonts, and narrow displays on Android.

No real reset emails are sent by the automated tests. Dashboard settings, real email delivery, and native link handling require the device acceptance checks above.

Official references: [Password recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
