# EasyBizInvoice mobile

Expo SDK 54 app in this directory. It is outside the pnpm workspace. Install and test with npm. Web, API, and deploy steps are in the repository [README](../README.md).

```bash
npm ci
npm start
npm run ios
npm run android
npm test
npm run lint
npm run type-check
```

`EXPO_PUBLIC_API_URL` defaults to `http://127.0.0.1:3001` (`mobile/src/features/auth/api/http.ts`).

Android EAS scripts in `mobile/package.json`: `npm run build:android`, `npm run build:android:preview`, `npm run build:android:development`, and `npm run submit:android`. Pull-request CI exports the iOS bundle with `npx expo export --platform ios` and sets `SENTRY_DISABLE_AUTO_UPLOAD=true`.

Crash reporting uses `@sentry/react-native`. Preview and production profiles in `eas.json` set `EXPO_PUBLIC_SENTRY_DSN`. Local `npm start`, Jest, CI, and the development profiles leave the DSN unset. When you copy Expo values from the repository `.env.example` into `mobile/.env`, leave `EXPO_PUBLIC_SENTRY_DSN` unset. Setup, scrubbing, and the optional source-map token are in [SENTRY.md](./SENTRY.md).
