# Ledger Craft Mobile App

React Native mobile application for iOS and Android, built with Expo.

## Setup Complete ✅

- Expo project initialized with TypeScript
- Core dependencies installed (React Navigation, Zustand, NativeWind, Supabase)
- Tailwind CSS / NativeWind configured
- Supabase client configured with secure storage
- Project structure created
- Environment variables set up

## Next Steps

1. Set up authentication screens
2. Implement navigation structure
3. Build invoice features (priority)

## Development

```bash
# Start development server
npm start

# Run on iOS
npm run ios

# Run on Android
npm run android
```

## Environment Variables

Copy the Expo values from the repo `.env.example` into `mobile/.env`.

Crash reporting stays off for local runs. Preview and production EAS builds already include the DSN. The optional source-map token is in `SENTRY.md`.

