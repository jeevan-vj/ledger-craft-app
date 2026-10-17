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
- Use the grouped canvas and white list surfaces. Prefer native grouped rows and whitespace over floating web-style cards; never nest cards.
- Every touch target is at least 44pt. Standard controls are 48pt; prominent primary actions may be 56pt and pill-shaped.
- Use the platform system typeface. Monetary values are prominent and tabular where supported; supporting copy remains quiet but readable.
- Use the existing icon library with consistent size and stroke. No emoji chrome.
- Use haptics only for deliberate actions. Motion is 140ms for feedback, 220ms for navigation, and 320ms for deliberate transitions; respect reduced-motion settings.

## Required states

Cover default, pressed, disabled, loading, error, empty, keyboard-open, long-content, and offline/retry states when applicable. Add accessibility roles, labels, hints or state without hiding useful visible copy. Ensure forms remain usable with the software keyboard, Dynamic Type, and screen readers.

Do not copy server data into new Zustand state, change API/auth boundaries, or mix navigation/repository migration into a visual task unless the user explicitly includes it.

## Verification

`mobile/` has its own npm dependency graph and is not currently in the pnpm workspace. Run the smallest relevant test from that directory. For syntax/type validation, use the project's available Expo/TypeScript command only when dependencies are installed; report the gap honestly otherwise.

For visual changes, inspect the shipped iOS device classes together: a current standard iPhone and one compact width. Also inspect Android when changing cross-platform layout or behavior. Exercise keyboard, loading, empty, error, and real-content states affected by the change. Perform one batched visual pass, one correction pass, then stop.
