# Justif.ai

**"Ang iyong munting Abogado"** — Your Little Lawyer

A beautifully designed, production-ready Filipino legal AI assistant mobile application powered by Google Gemini, Supabase, and React Native (Expo).

---

## 🏗️ Architecture

```
Justif.ai/
├── backend/          FastAPI + Google Gemini + Supabase
└── mobile/           React Native (Expo SDK 54) + NativeWind
```

## 🚀 Quick Start

### Prerequisites

- **Python 3.10+** for the backend
- **Node.js 18+** for the mobile app
- **Supabase** account with a project created
- **Google AI Studio** API key for Gemini

### 1. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate    # Windows
# source venv/bin/activate  # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your Supabase and Gemini credentials

# Run the database schema
# Copy the contents of supabase_schema.sql and run it in the Supabase SQL Editor

# Start the server
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000` with docs at `/docs`.

### 2. Mobile App Setup

```bash
cd mobile

# Install dependencies
npm install

# Configure Supabase
# Edit lib/supabase.ts with your SUPABASE_URL and SUPABASE_ANON_KEY

# Start the development server
npx expo start
```

### 3. Environment Variables

#### Backend (`backend/.env`)

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_KEY` | Supabase anon/public key |
| `SUPABASE_JWT_SECRET` | JWT secret from Supabase Settings > API |
| `GEMINI_API_KEY` | Google AI Studio API key |
| `CORS_ORIGINS` | Allowed CORS origins (default: `*`) |

#### Mobile (`mobile/lib/supabase.ts`)

Update the constants with your Supabase credentials, or use environment variables:
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_API_URL` (production API URL)

---

## 📱 Building for Play Store

```bash
cd mobile

# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Build APK for testing
eas build --platform android --profile preview

# Build AAB for Play Store
eas build --platform android --profile production

# Submit to Play Store
eas submit --platform android --profile production
```

---

## 🎨 Brand Vision

- **Color Palette**: Professional Teal/Deep Azure + Sunset Gold accents
- **Tone**: Warm, respectful Filipino (Taglish)
- **Feel**: Modern law firm in BGC — professional yet welcoming

---

## 📋 Features

- ✅ Supabase Authentication (Email/Password)
- ✅ AI-powered legal chat (Google Gemini 1.5 Flash)
- ✅ Conversation history with Supabase persistence
- ✅ Swipeable drawer navigation
- ✅ Filipino-first UI language
- ✅ Play Store ready (EAS Build)
- ✅ JWT-protected backend API
- ✅ Row-Level Security on all database tables

---

## ⚖️ Disclaimer

Justif.ai provides **general legal information only** and does not constitute legal advice. Always consult a licensed attorney for your specific legal situation.

---

Built with ❤️ for the Filipino community.
