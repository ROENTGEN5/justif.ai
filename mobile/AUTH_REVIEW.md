# Login and registration review

## Implemented

- Removed Google sign-in buttons, handlers, native plugin, dependency, and unused UI strings.
- Added a forgot-password screen, neutral email-request confirmation, resend cooldown, and same-device instructions.
- Added a PKCE reset screen that verifies a recovery code before accepting a new password, rejects ordinary signup codes, checks for account switches, and closes its local session after completion or explicit cancellation.
- Added inline field validation, friendly auth/network/rate-limit errors, duplicate-submit guards, password-manager hints, independent show/hide controls, visible focus borders, screen-reader labels, and keyboard-safe scrolling.
- New-account and reset forms require at least eight characters. Sign-in accepts existing passwords without applying the new minimum.
- Registration now distinguishes email-confirmation guidance from immediate sign-in, using the actual signup result. Signed-out launches open Sign In.
- Added confirmation-email resend from login and confirmation-required registration, with a 60-second UI cooldown, duplicate-submit guard, neutral response, and friendly rate-limit/network errors.
- Exposed one shared privacy notice at the public `/privacy-notice` route and the existing signed-in privacy route. Login and registration link to the public notice. It also stays accessible while session restore is loading or failed.
- Replaced the forced three-second signed-out fallback with an explicit restore state, a 12-second timeout/retry screen, connection guidance, and protection against stale restore responses overwriting newer auth events.
- Applied the same eight-character check in registration and recovery service calls, in addition to the forms. This is client-side validation, not proof of the hosted Supabase policy.

## Required before considering recovery released

1. **Email delivery:** custom SMTP was last verified disabled before the user began Gmail setup; the saved configuration and actual delivery have not been reverified. Configure a verified sender and test actual delivery. Mobile redirects and default template links were verified in the live dashboard on 31 October 2026. Without working mail delivery, a reset button cannot provide usable account recovery.
2. **Real device test:** request a reset email from the installed APK and open it on the same device; change the password and sign in. Also test a cold start, a reused link, app backgrounding, cancellation, and the device Back button. Unit tests and a web preview do not replace this.
3. **Server password rules:** completed: the live minimum is eight characters, verified after saving and reopening the Email settings.

## Suggested next improvements

1. **Account security controls:** provide password changes for signed-in users and clear session/device sign-out controls, with server policy and recovery behavior tested together.
2. **Cross-device recovery:** current PKCE recovery intentionally depends on the requesting installation. If users need to open email on another device, design and test an email-code flow or a hosted recovery page.
3. **Abuse controls:** review Supabase auth rate limits and add CAPTCHA only if real signup/reset abuse warrants it. The UI cooldown is not a server-side limit.
4. **Web theme configuration:** the web preview exposes an existing NativeWind media/class dark-mode mismatch. Resolve this before treating the web build as release-ready; Android still needs its own device checks.

## External setup status

- **Hosted Supabase password policy:** completed through the authenticated dashboard on 31 October 2026 (Asia/Manila). Changed the minimum from 6 to 8, saved, reopened Email settings, and visually verified the persisted value. Other password settings were left unchanged.
- **Redirects:** added `justifai://login` and `justifai://reset-password` to the previously empty allowlist. Changed the Site URL fallback from `http://localhost:3000` to `justifai://login`. Saved and verified both after reload.
- **Email templates:** verified that both live default signup and reset templates use `{{ .ConfirmationURL }}`. No replacement was necessary. Optional branded drafts in `auth-email-templates/` remain unapplied.
- **SMTP:** custom SMTP was disabled at the last dashboard verification. The user subsequently began Gmail SMTP setup and saw the expected personal-provider warning. Saved settings and actual email delivery have not been independently verified; no live emails were sent by the agent.
- **Native device acceptance and deployment:** not performed for these changes. Build/install an updated APK and run the acceptance checks in README.md before release. The user has now authorized pushing these changes and starting the preview-arm64 APK build; consult Git history and Expo for the resulting deployment status.
- **Privacy-policy claims:** the existing notice was reused, not legally audited or independently verified.

## Validation completed locally

- TypeScript, lint, auth/recovery behavior tests including resend and deterministic session timeout/retry/race tests, account-cache isolation checks, and guided-flow accessibility checks.
- Web preview checks for login field validation, navigation, registration, missing-code recovery, resend validation, and public privacy access with return navigation while signed out. No real account creation, mail sending, or password change is performed by these checks.

Known unrelated CI issues from the preceding deployment remain: the server bind-address Bandit finding and Linux CSS declaration typing. These are separate from the auth behavior tests.

## Latest external setup attempt

- Confirmed the Supabase integration connection by reading the Justif.ai project; it reports ACTIVE_HEALTHY. Available tools do not include Auth configuration updates.
- The user completed the dashboard sign-in and GitHub two-factor verification. The minimum password length was then changed from 6 to 8 and verified after reopening the settings. Google sign-in is disabled, and email confirmation is currently off; neither toggle was changed.
- Prepared signup/reset email HTML using Supabase's verified confirmation-link placeholder.
- Standard Android SDK/ADB tooling is not available in this workspace. Testing the newly added native recovery screens also requires a compatible installed app/development client. No APK was built during the initial setup phase; the user has subsequently authorized an APK build.
- GitHub push and APK build were excluded from the initial setup phase and subsequently authorized by the user.
