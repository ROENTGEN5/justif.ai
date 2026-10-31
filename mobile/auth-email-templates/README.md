# Supabase authentication email templates

These files are prepared locally. They have NOT been applied to the hosted project or tested through a real inbox.

| Supabase template | Subject | Body file |
| --- | --- | --- |
| Confirm sign up | Confirm your Justif AI email | confirm-signup.html |
| Reset password | Reset your Justif AI password | reset-password.html |

Both templates keep `{{ .ConfirmationURL }}` for the button and fallback link. Supabase must verify the email token before redirecting to the app; using `{{ .RedirectTo }}` directly would skip this step.

## Settings to verify and apply

- Project: `lvolxrcufdqllvpfzsxd` (Justif.ai).
- Minimum password length: `8`.
- Redirect allowlist: verified after reload; contains `justifai://login` and `justifai://reset-password`. Previous allowlist was empty. Site URL changed from `http://localhost:3000` to `justifai://login` and verified after reload.
- Email templates: both live default bodies were verified to use `{{ .ConfirmationURL }}` on 31 October 2026. No replacement was necessary; these branded drafts remain optional and unapplied.
- SMTP: use an existing verified sender and the chosen provider's host, port, username, and password. Keep SMTP credentials in Supabase, never in the mobile app or Git.
- Check the provider's link tracking setting. Rewriting authentication links and mail-security scanners can interfere with one-use authentication links; verify actual inbox behavior rather than assuming delivery proves recovery works.

## Acceptance record

| Check | Result |
| --- | --- |
| Live password minimum read back as 8 | Completed: changed from 6 to 8 and verified by reopening Email settings |
| Required app URLs allowed | Completed: added justifai://login and justifai://reset-password; previous allowlist was empty |
| Signup and reset templates verified in Supabase | Completed: both default templates use {{ .ConfirmationURL }}; no replacement was necessary |
| SMTP enabled with a verified sender | Pending provider setup and verified sender; custom SMTP currently disabled |
| Confirmation email delivered to a designated test address | Pending recipient and delivery setup |
| Reset email delivered, link opens current Android recovery form | Pending recipient, delivery setup, and a compatible installed app |
| New password saved and sign-in succeeds | Pending user-assisted Android test |
| Old/reused link rejected | Pending user-assisted Android test |

No GitHub push or APK build is part of this setup task.

References: [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [SMTP configuration](https://supabase.com/docs/guides/auth/auth-smtp).
