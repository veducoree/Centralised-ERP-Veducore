# Veducore Mobile App

React Native (Expo) mobile app for **Greenwood International School** — built specifically for **Teachers** and **Parents**. Works seamlessly on both **iOS** and **Android**.

> **Note:** The Admin portal is exclusively available on the Web dashboard.

## Tech Stack

- Expo SDK 51 + Expo Router v3 (file-based routing)
- React Native 0.74, TypeScript (strict mode, zero errors)
- AsyncStorage — local mock database (no backend needed)
- `@expo/vector-icons` Ionicons, `expo-linear-gradient`

## Demo Credentials

| Role    | Email                    | Password     |
|---------|--------------------------|--------------|
| Teacher | `teacher1@greenwood.edu` | `Teacher@123`|
| Parent  | `parent1@greenwood.edu`  | `Parent@123` |

## Getting Started

```bash
cd app
npm install
npm start          # or: npx expo start
npm run ios        # iOS simulator
npm run android    # Android emulator
```

Install [Expo Go](https://expo.dev/go) on your phone to scan the QR and run on device.

## Teacher Screens
- **Dashboard** — Time-aware greeting, today's schedule, assigned classes, quick actions
- **My Classes** — Class assignments with expandable student lists and student profile view
- **Attendance** — Mark present/absent/late per student, submit saves to AsyncStorage DB
- **Marks** — Enter exam marks per student, auto-computed grade badges
- **Students** — Search, section filter, student enrollment, and full 4-tab student detail modal
- **Modals** — Timetable schedule, remarks feedback, notifications, profile and logout

## Parent Screens
- **Dashboard** — Multi-child switch card, attendance rate gauge, pending fees, recent academic score & remark
- **Attendance** — Monthly attendance calendar with present/absent/late status tags
- **Fees** — Breakdown of fee invoices, paid vs pending balance, due dates, and receipts
- **Academic Records** — Exam scores, max marks, percentage, and grade badges
- **Remarks** — Teacher remarks grouped by category (Academic, Behaviour, General)
- **Profile** — Parent guardian details, linked children, and sign out
