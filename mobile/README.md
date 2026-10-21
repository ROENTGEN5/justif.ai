# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Development Build & Google Sign-In Setup

This project uses an **Expo Development Build** (`expo-dev-client`) to support native modules including `@react-native-google-signin/google-signin`.

> **Note**: Native Google Sign-In cannot run in standard Expo Go. You must use the development build APK.

### 1. Build the Development Client (Android APK)

Run EAS build in the `mobile` directory to generate an installable development build APK:

```bash
npm run build:dev:android
# or: npx eas build --profile development --platform android
```

Once the build finishes:
1. Download the generated `.apk` file to your Android phone or drag it onto your Android emulator.
2. Install the APK (named **Justif.ai**).

### 2. Configure Google Cloud Console & Supabase

1. Go to [Google Cloud Console](https://console.cloud.google.com/) -> **APIs & Services** -> **Credentials**.
2. Create an **OAuth 2.0 Client ID** of type **Web application**:
   - Copy the Client ID.
   - Paste it into `mobile/.env` as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
3. Create an **OAuth 2.0 Client ID** of type **Android**:
   - Package name: `com.justifai.app.v2` (from `app.json`).
   - SHA-1 fingerprint: Obtain your build certificate fingerprint by running `npx eas credentials` in `mobile/`, or copy the SHA-1 from your EAS build dashboard.
4. Go to your [Supabase Dashboard](https://supabase.com/dashboard) -> **Authentication** -> **Providers** -> **Google**:
   - Enable Google provider.
   - Enter your **Google Client ID** (Web Client ID) and **Client Secret**.
   - Check **"Skip nonce checks"** (required for native `signInWithIdToken`).

### 3. Run Development Server

Start the Metro development server configured for the development client:

```bash
npm start
# or: npx expo start --dev-client
```

Open the installed **Justif.ai** app on your phone and either scan the terminal QR code or select the local development server URL.

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
