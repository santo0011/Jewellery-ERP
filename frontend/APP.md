# Mobile app (Android / iPhone)

The website and the app are the same code. The app is the website's build wrapped with
[Capacitor](https://capacitorjs.com); both talk to the same backend and database.

## One-time setup

1. Install **Android Studio** (it brings Java and the Android SDK).
2. Put the backend on a server with **HTTPS**, e.g. `https://api.your-domain.com`, and in its `backend/.env` set:
   ```
   COOKIE_SECURE=true
   COOKIE_SAMESITE=none
   CORS_ALLOW_APP=true
   ```
3. Copy `frontend/.env.app.example` to `frontend/.env.app` and set `VITE_API_URL` to that address.

## Build and run

```
cd frontend
npm run build:app      # builds the screens for the app and copies them into android/
npm run app:android    # opens the project in Android Studio → Run (phone/emulator) or Build → APK / AAB
```

Run `npm run build:app` again after every change to the screens.

The website is unaffected: `npm run dev` / `npm run build` work exactly as before.

## iPhone

Needs a Mac with Xcode: `npm i -w frontend @capacitor/ios`, then `npx cap add ios` and `npx cap open ios`.
