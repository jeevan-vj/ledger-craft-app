---
name: ledgercraft-mobile-ui
description: Build, redesign, or review LedgerCraft Expo interfaces using its Wise-inspired native design system. Use for React Native screens, navigation chrome, mobile components, NativeWind or StyleSheet styling, accessibility, and device QA; not for web-only UI.
---

# LedgerCraft mobile UI

Create a spacious, direct native financial experience without copying Wise trademarks, wordmarks, flags, proprietary assets, or exact product screens.

## Authority

Before editing, read:

1. `DESIGN.md` → **Mobile: LedgerCraft Wise**.
2. `mobile/src/theme/tokens.ts` for runtime tokens.
3. `mobile/src/theme/navigation.ts`, `mobile/tailwind.config.js`, and relevant components in `mobile/src/components/ui/`.

These current files supersede legacy blue-mobile, glassmorphism, emoji, and Supabase-era examples in `.cursor/rules/project-guide.mdc`. Preserve the product behavior and architecture in `AGENTS.md` and `TARGET_ARCHITECTURE.md`.

## Build decisions

- Use React Native primitives only. Never introduce HTML elements into mobile screens.
- Use `palette`, `space`, `radius`, `control`, `motion`, and typography tokens instead of hard-coded colors, spacing, radii, or durations.
- Lime `#9FE870` is the primary action surface and forest `#163300` is its text. Never put white text on lime. `accentForeground` is only for ink on lime. Spinners, labels, and icons on dark surfaces use `accent`, `accentText`, or `text` from `useTheme()`.
- Reuse `ModernButton`, `ModernInput`, `GroupedSection`, `ListRow`, `IconWell`, `QuickAction`, `EmptyState`, and the compatibility `ActionButton` / `FormInput` primitives when their intent matches.
- Preserve native navigation: iOS large titles, system back gestures, native modal presentation, safe areas, and Liquid Glass-compatible bars. Do not add an opaque `tabBarStyle` tint.
- Mount one `SafeAreaProvider` at the app root. Screens must consume the resulting metrics; do not guess status-bar, home-indicator, or Dynamic Island offsets.
- Every `ScrollView` or `FlatList` below an iOS large-title header uses `contentInsetAdjustmentBehavior="automatic"`. Its first child must begin at the natural content origin; do not compensate with route-specific top spacers.
- Screens inside the native bottom-tab navigator use `useTabScreenInsets()` for bottom content padding. Fixed action surfaces reserve `tabBarClearance`, measure their rendered height, and add that height to the scroll container; fixed `32`, `40`, or `100` pixel footer spacers are not sufficient.
- Printable A4 invoice HTML stays 595 × 842 CSS pixels, but mobile preview metadata must allow the WebView to choose its fit-to-width initial scale. Do not force `initial-scale=1` on the 595px viewport.
- Use the grouped canvas and white list surfaces. Prefer native grouped rows and whitespace over floating web-style cards; never nest cards.
- Every touch target is at least 44pt. Standard controls are 48pt; prominent primary actions may be 56pt and pill-shaped.
- Use the platform system typeface. Monetary values are prominent and tabular where supported; supporting copy remains quiet but readable.
- Use `AppPressable` whenever `style` is a function. NativeWind v4's JSX runtime wraps `Pressable` and replaces a style callback with `{}` (`cssInterop={false}` is the opt-out). Plain object styles on `Pressable` still render.
- Use the existing icon library with consistent size and stroke. No emoji chrome.
- Use haptics only for deliberate actions. Motion is 140ms for feedback, 220ms for navigation, and 320ms for deliberate transitions; respect reduced-motion settings.

## Required states

Cover default, pressed, disabled, loading, error, empty, keyboard-open, long-content, and offline/retry states when applicable. Add accessibility roles, labels, hints or state without hiding useful visible copy. Ensure forms remain usable with the software keyboard, Dynamic Type, and screen readers.

Do not copy server data into new Zustand state, change API/auth boundaries, or mix navigation/repository migration into a visual task unless the user explicitly includes it.

## Verification

`mobile/` is not in the pnpm workspace. Before a pull request, run the Mobile job commands in `ledgercraft-verify` (Node 20: `npm ci`, `npm run lint`, `npx tsc --noEmit --pretty false`, `npm test -- --ci --watchAll=false`, and the iOS export). Paste the output. A missing install is `not run`, not a pass.

For visual changes, inspect a current standard iPhone and one compact width, plus Android when the layout is shared. Exercise keyboard, loading, empty, error, and real-content states the change can hit. Perform one batched visual pass, one correction pass, then stop. A phone-width web screenshot does not replace device QA, and device QA does not replace the Mobile CI commands.
