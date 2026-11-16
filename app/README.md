# Veducore Mobile App

Expo (React Native) app for **teachers** and **parents**. It talks to the same Supabase project as the web portal. The admin and office portal is web-only.

## Run locally

```bash
cd app
npm install
npx expo start        # Expo Go works for everything except push on Android
```

## Screens

**Teacher:** dashboard, my classes, student attendance (class teacher), exam marks, students, schedule, remarks, my attendance + leave, notifications, profile.

**Parent:** dashboard (multi-child), attendance calendar, fees + online payment + receipts, academic records, remarks, transport (apply / status), timetable, notifications, profile.

## Push notifications: one-time setup

Push needs a real build. Expo Go on Android can't receive remote push.

1. **Link the EAS project** (adds `extra.eas.projectId` to `app.json`):
   ```bash
   cd app
   eas login
   eas init
   ```
2. **Server secret.** Supabase runs the `push-dispatch` edge function from a DB trigger:
   ```bash
   SECRET=$(openssl rand -hex 32)
   supabase secrets set PUSH_DISPATCH_SECRET=$SECRET
   ```
   Then in the Supabase SQL editor:
   ```sql
   INSERT INTO app_settings (key, value) VALUES
     ('push_dispatch_url', 'https://earrifjgtsympejzfrtx.supabase.co/functions/v1/push-dispatch'),
     ('push_dispatch_secret', '<same SECRET>')
   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
   ```
3. **Android credentials (FCM).** Create a Firebase project with Android package `com.veducore.app`, then upload its FCM V1 service-account key with `eas credentials` (Android → Push Notifications). iOS push needs an Apple Developer account. EAS sets up the APNs key on the first iOS build.
4. **Build and install:**
   ```bash
   eas build -p android --profile preview      # installable APK
   eas build -p android --profile production   # Play Store bundle
   ```
5. **Test:** sign in on the phone as a parent and mark that child absent from a teacher account. The parent should get a push, and tapping it should open Attendance.

Tokens live in `push_tokens` (saved on sign-in, removed on sign-out). Each user's mute settings live in `notification_preferences`.
