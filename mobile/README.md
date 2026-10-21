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

Android EAS scripts in `mobile/package.json`: `npm run build:android`, `npm run build:android:preview`, `npm run build:android:development`, and `npm run submit:android`. Pull-request CI exports the iOS bundle with `npx expo export --platform ios`.

There is no `mobile/SENTRY.md`. This package does not depend on Sentry.
