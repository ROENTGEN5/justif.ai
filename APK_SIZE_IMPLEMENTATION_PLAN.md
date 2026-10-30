# Smaller APK implementation plan

Prepared 29 October 2026 (Asia/Manila).

## Objective

Build a smaller signed release APK for direct installation by capstone testers, without requiring Google Play publication. Preserve the existing development build and a broadly compatible release APK. Measure the actual APK bytes before claiming savings.

## Current project

- `mobile/eas.json` has development, preview APK and production AAB profiles. Development uses a development client; preview is the appropriate release baseline.
- `mobile/app.json` uses Hermes. Keep it enabled.
- No checked-in `mobile/android` directory exists; native settings must be generated through Expo configuration.
- `expo-build-properties` is not installed. Verify the installed Expo SDK's supported plugin version and property names before changing configuration.
- The four local image assets total approximately 1 MB. Native libraries and architecture duplication should be investigated before spending time compressing these images.
- Preview currently targets the deployed Render backend. Starting a backend on the developer computer does not update Render or make its local Ollama endpoint available remotely.

## 1. Establish a comparable release baseline

1. Locate the current APK and record which EAS profile produced it, its SHA-256, byte size, app version/build number and signing identity. Do not assume an APK is a development build from its size.
2. Use the same source snapshot, dependency lockfile, signing key and API endpoint for the baseline and optimized builds. Build the existing `preview` profile if no comparable release APK exists.
3. Inspect APK contents with Android Studio APK Analyzer or ZIP entry-size analysis. Report native libraries by ABI, DEX/code, resources and bundled assets. ZIP size inspection identifies contributors; it does not measure installed size.
4. Record tester devices and supported ABIs. ARM64-only builds require `arm64-v8a` support; do not assume every Android phone is compatible.

Deliverable: `mobile/release-size-report.md` with baseline build information, file size and largest content groups. Mark unavailable measurements explicitly.

## 2. Configure release shrinking

Files: `mobile/package.json`, `mobile/package-lock.json`, `mobile/app.json` or a new `mobile/app.config.js`.

1. Install the compatible plugin through `npx expo install expo-build-properties`.
2. Inspect the installed SDK/plugin defaults: minification may already be enabled. Configure supported Android release minification/resource-shrinking options explicitly where appropriate; do not claim savings from merely restating defaults.
3. Apply shrinking only to release builds. Keep development tooling available through the development profile.
4. Validate resolved Expo configuration and generated Gradle settings in an isolated temporary copy/prebuild inspection. Avoid generating an Android directory in the primary managed project just to inspect it.
5. Test native integration before adding any R8 keep rules. Add narrowly scoped rules only when a reproducible release failure requires them. Retain mapping files for diagnosing release stack traces.

Done when: generated release settings match the intended configuration and the optimized release installs and launches. Hermes and all current user-facing features remain available.

## 3. Add an ARM64 release profile

Files: `mobile/eas.json`, optional `mobile/app.config.js`, `mobile/package.json` scripts.

1. Add `preview-arm64`, extending `preview`, with `developmentClient: false`, internal distribution and APK output.
2. Select `arm64-v8a` through the SDK-supported build-architecture configuration. Prefer a conditional `expo-build-properties` setting driven by a dedicated profile environment variable; confirm the supported property in the installed plugin instead of assuming EAS accepts arbitrary Gradle fields.
3. Preserve the universal `preview` profile for testers whose devices are not supported by the ARM64 build, and preserve production AAB configuration for optional future store distribution.
4. Preserve the Android package ID and signing certificate so testers can update an existing compatible install. Assign an increasing versionCode. Account for existing EAS remote/local version management before choosing an increment strategy.
5. Add clear build commands/scripts for universal release and ARM64 release. Do not remove dependencies or features simply because their size has not yet been measured.

Done when: APK inspection confirms the ARM64 artifact includes ARM64 native libraries and excludes other ABIs. The universal release retains its supported ABIs.

## 4. Build and measure

Once profiles are implemented:

```powershell
cd mobile
npx eas-cli build --platform android --profile preview
npx eas-cli build --platform android --profile preview-arm64
```

EAS builds require Expo authentication and available build quota; availability and cost must be checked at execution time. Google Play registration is not needed for direct APK distribution. A configured local Android build is an alternative if EAS quota is unavailable, with separate SDK/JDK requirements.

1. Build both release artifacts from the same source revision and dependency lockfile.
2. Record EAS build IDs, checksums, APK file bytes, included ABIs and measured installed size on the same device if available.
3. Compute reduction as `(baseline_bytes - optimized_bytes) / baseline_bytes * 100`. Compare release to release; report a development-to-release difference separately if useful.
4. Do not present AAB file size as a direct-install APK or claim device download savings without measuring the relevant artifact.

## 5. Release verification

Run on at least one compatible physical ARM64 device:

- Fresh install, launch, relaunch and update from the prior signed build.
- Email and Google authentication; verify release signing fingerprints/configuration if Google sign-in fails.
- New chat, streamed response, follow-up, source links and restored history.
- Image/PDF selection, camera capture, file analysis and upload limits.
- Profile/avatar, clipboard and speech features.
- Background/resume, offline errors and interrupted requests.

Run TypeScript checks and existing mobile transport tests. Record existing lint failures separately. A successful cloud build alone does not establish that shrinking preserved native functionality.

Verify the backend URL is reachable from testers' devices. Do not ship a desktop `localhost` address. If the release points at Render, ensure that deployed backend has an accessible working embedding service; the developer computer's Ollama service is not automatically accessible to Render.

Done when: all declared release workflows pass, there are no new startup/native-module failures, and both release artifacts have recorded measurements. If shrinking causes regressions, adjust narrowly or roll back the shrinking change while retaining measured architecture savings.

## 6. Distribute directly

1. Share the tested ARM64 APK through an approved download location, with version, file size, checksum and device compatibility stated. Keep the universal APK available as a fallback.
2. Explain that Android may ask the tester to allow installation from that download source. Do not instruct users to disable device security broadly or bypass an actual malware warning.
3. Preserve signing credentials and release artifacts. Do not include credentials, debug logs or private reviewer/tester data in the distribution bundle.
4. Record installation failures, device ABI, Android version and app version to distinguish compatibility problems from application defects.

## Acceptance and effort

Success means a measured reduction against the comparable release APK, successful installation on declared compatible devices, and preserved feature behavior. There is no promised MB size or percentage reduction until builds are produced.

Indicative effort: half a day for configuration/baseline analysis, build-queue time, and half to one day for physical-device release checks. Native shrinking regressions or unavailable build infrastructure may extend this.

This document is the implementation plan. No dependencies, build profiles, shrink settings or published artifacts were changed when creating it.
