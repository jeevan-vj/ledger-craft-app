# Mobile sign-in

Mobile sign-in is the Expo email login screen. A person opens the iOS or Android app and sees Login before any organisation data.

## Sub-features

- `mobile-login-open` shows the login screen on a device or simulator.
- `mobile-login-submit` signs in against the API and lands in the signed-in tabs.
- `mobile-bundle` produces an iOS or Android bundle with `expo export`.

## How to get to it (user POV)

- Launch the dev client or a store build (`com.easybizinvoice.app`, scheme `easybizinvoice`).
- The signed-out root stack shows `Login` (`AuthStackParamList` in `mobile/src/navigation/types.ts`).

## Driving it with the browser

Preconditions:

- A booted iOS simulator or Android emulator with this project installed, plus `EXPO_PUBLIC_API_URL` pointing at the API you started.
- This checkout does not meet that precondition.

- **Open Login.** Launch the native app. The Login screen is visible. Screenshot it on the device.
- **Sign in.** Submit the email and password for an account in the API database. The tab bar shows Home, Invoices, Customers, and More.
- **Bundle substitute.** From `mobile/`, `npx expo export --platform ios` and `npx expo export --platform android` exit 0 and write a bundle. Record the exit code. That artifact does not show the Login screen.
- **Type and unit checks.** `npx tsc --noEmit` and `npm test` are the repo commands. On 2026-10-17, `tsc` exited 2 and `npm test` failed two Supabase-auth suites (`User not authenticated`). Report those results. Do not call the Login screen verified because a unit test passed.

## Gotchas

- No simulator or emulator is available in the standard cloud checkout. The device journey fails that precondition. Do not restyle the gap as a pass via export.
- `npm run ios` and `npm run android` need a local native toolchain. They are not a substitute you can claim without the log of a booted simulator.
- Do not run `eas build` or `npm run build:android` as verification. Those publish builds and need explicit approval.
- The EAS project id `7148323b-502c-447e-96c3-a5c1704c40c9` and `@jeevan90/easybizinvoice-mobile` stay unchanged.
