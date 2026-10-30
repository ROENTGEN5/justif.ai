# APK size implementation — 29 October 2026

Added two opt-in profiles:

- `preview-optimized`: signed internal release APK with R8 minification and resource shrinking; retains universal architecture defaults.
- `preview-arm64`: same release configuration, restricted to `arm64-v8a`.

Both inherit the existing preview API endpoint and signing setup. Development, original preview and production profiles retain their previous build settings. Hermes remains enabled. EAS increments the versionCode for new optimized builds.

The local `plugins/withReleaseSize.js` config plugin sets Android Gradle properties during Expo prebuild. No extra runtime/native dependency was installed. Installing expo-build-properties encountered a pre-existing SDK/router peer-dependency conflict, so the attempted package addition was removed rather than forcing dependency resolution.

## Checks completed

- Expo config introspection confirms ARM64-only architecture plus both shrinking flags for `APK_SIZE_MODE=arm64`.
- Universal introspection confirms both shrinking flags without an architecture override.
- Default introspection confirms no new properties applied to existing profiles.
- TypeScript compilation and mobile stream transport regression checks pass.
- Expo authentication and existing remote Android signing credentials are available. The build command selected the existing keystore and incremented Android versionCode from 1 to 2.

## Commands

```powershell
npm run build:apk:small
npm run build:apk:universal
```

## Validation limits

EAS build submission was initiated; consult its build status for the artifact/result. APK byte size, included native libraries, release startup and physical-device workflows cannot be certified from configuration introspection. No measured size reduction is claimed yet. Native release checks must cover authentication, camera/files, chat/streaming, history and speech before distribution. Retain the universal build for incompatible devices.

Preview points at Render, not the local backend. Confirm the deployed backend and embedding service work before sharing an APK. ARM64-only builds do not support 32-bit-only devices or x86-only emulators.
