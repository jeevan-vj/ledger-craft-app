---
name: ledgercraft-web-ui
description: Build, redesign, or review LedgerCraft web interfaces using its Revolut-inspired design system. Use for React/Vite pages, web components, responsive layouts, Tailwind styling, accessibility, and web visual QA; not for Expo-native UI.
---

# LedgerCraft web UI

Create a crisp financial operating surface without copying Revolut trademarks, proprietary assets, or exact product screens.

## Authority

Before editing, read:

1. `DESIGN.md` → **Web: LedgerCraft Revolut**.
2. `src/design-system/revolut.css` for canonical semantic tokens.
3. `tailwind.config.ts` and the relevant components in `src/components/ui/`.

The current files above supersede legacy color, gradient, glassmorphism, emoji, and Supabase-era examples in `.cursor/rules/project-guide.mdc`. Preserve the product behavior and architecture in `AGENTS.md` and `TARGET_ARCHITECTURE.md`.

## Build decisions

- Use semantic utilities: `bg-primary`, `text-foreground`, `text-muted-foreground`, `bg-card`, `border-border`, and semantic status colors. Do not add feature-specific hex values to product UI.
- Treat printable invoice templates as intentionally isolated customer-facing themes. Do not force app-shell tokens into them.
- Reuse `Button`, `Input`, `Card`, `ContentPanel`, `Badge`, `SegmentedControl`, `PageHeader`, and `EmptyState` when their intent matches. Extend a primitive only for a repeated pattern.
- Keep one visually dominant action per task. Primary actions use the accessible deep-blue `primary`; `brand` is for focus, selection, and small emphasis.
- Use 16px corners for cards/panels and 12px for fields. Use either a visible border or `shadow-surface`, not both.
- Use the configured Avenir Next-led stack. Keep page titles 30–36px, body text 14–16px, readable copy at 65–75 characters, and financial values tabular.
- Prefer spacing and hierarchy over more cards. Avoid nested cards, equal-weight card grids, decorative glass/blur, gradient text, texture overlays, and generic dashboard ornament.
- Use Lucide icons with consistent stroke weight. Do not use emoji as interface chrome.
- Keep interactions restrained: 200–220ms feedback, a 0.98 pressed scale when helpful, and no repeated entrance animation on every item.

## Required states

For every changed interaction, cover the states that can occur: default, hover, keyboard focus, pressed, disabled, loading, error, empty, and long/real content. Keep controls keyboard-operable and labelled. Body and placeholder text must meet WCAG AA contrast.

Do not change routing, API boundaries, auth, data flow, or repository layout as part of a visual task unless the user explicitly includes that work.

## Verification

Run the focused test, then the CI commands in `ledgercraft-verify` before a pull request. `pnpm type-check` is not the web CI gate: the job allows a recorded error ceiling and fails only when the count rises. Do not treat a non-zero `tsc` exit, by itself, as a failed pull request, and do not edit the ceiling.

For a UI change, follow `ledgercraft-verify-ui`: phone width 390×844 with a screenshot, and 1440×900 when layout changed. Check both web themes when shared tokens or theme-aware components changed. Perform one batched visual pass, one correction pass, then stop.
