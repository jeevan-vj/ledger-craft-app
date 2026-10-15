---
target: mobile app native tabs and Revolut UX
total_score: 16
p0_count: 2
p1_count: 3
timestamp: 2026-09-07T20-12-54Z
slug: mobile-src-navigation-appnavigator-tsx
---
# Critique: LedgerCraft mobile navigation + Revolut UX

Target: `mobile/src/navigation/AppNavigator.tsx` (shell for Home, Invoices, Expenses, Settings)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Spinners exist; list loading is plain text; dashboard errors are `console.error` only; saves end in blocking `Alert.alert` |
| 2 | Match System / Real World | 2 | "Total Balance" is invoice net, not cash. USD on a NZ GST product. Emoji metaphors instead of SF Symbols |
| 3 | User Control and Freedom | 2 | Discard confirm on create is good. Invoice Detail has no back. Sign out has no confirm |
| 4 | Consistency and Standards | 1 | JS custom tabs, navy headers, shadcn auth tokens, Revolut hex, leftover `#33415C`. Native stack then stripped |
| 5 | Error Prevention | 2 | Paid status opens payment modal (good). Expense date is free-text. First customer auto-picked. Sign out is one tap |
| 6 | Recognition Rather Than Recall | 2 | Tabs are labeled. Swipe-to-change-status is hidden. Search is not the platform search bar |
| 7 | Flexibility and Efficiency | 1 | No bulk actions, no native search. 350ms decorative tab springs |
| 8 | Aesthetic and Minimalist Design | 1 | Duplicate metrics, navy chrome, emoji, empty dashboard squares, weekday on every header |
| 9 | Error Recovery | 2 | Login surfaces `error.message`. Invoice validation is a generic Alert. Dashboard load failure is silent |
| 10 | Help and Documentation | 1 | Invoice empty state copy is decent. No swipe hint. Settings Account/Notifications are Coming Soon |
| **Total** | | **16/40** | **Poor** |

## Anti-Patterns Verdict

**Does this look AI-generated?** Yes, as a product UI. A Revolut/Stripe user would pause immediately.

**LLM assessment:** The app never disappears into the task. Native stack is present, then overwritten with a JS tab bar (`#1a1f3a`), navy `#1E2875` painted headers, emoji as the icon system, and a hero-metric dashboard that restates net income three times. Three palettes compete: shadcn HSL on auth, `#5B72EE` buttons, `#1E2875` chrome, leftover `#33415C` on invoice amounts. `BalanceCard` / `StatCard` / `QuickActionButton` exist and Home ignores them, inlining empty colored squares instead of icons.

**Deterministic scan:** Bundled `detect-antipatterns.mjs` is missing from the Impeccable skill, so CLI detector returned exit 1 with no JSON. Manual signal scan of `mobile/src` found: 45 listed-emoji uses / 22 files; 63 `Alert.alert`; 237 `TouchableOpacity` vs 0 RN `Pressable`; `createBottomTabNavigator` + `CustomTabBar`; 12 `headerShown: false`; 20 `LinearGradient`; 146 hardcoded `#000`/`#fff`/`#FFFFFF` literals (36 of those are `shadowColor: '#000'`, a likely false positive). Settings has 2 TODOs and a Coming Soon badge.

**Visual overlays:** Not available. React Native target; no live LedgerCraft Expo web URL. Overlay injection not attempted.

## Overall Impression

The substrate is right (native-stack, labeled tabs, swipe cards with large amounts, skippable onboarding). The chrome is wrong. Biggest opportunity: replace JS tabs and painted navy headers with native tabs + native large titles + native search, then make Home a light work surface with one money line, not a bank-balance poster.

## What's Working

1. **Invoice card amounts are Revolut-correct.** `SwipeableInvoiceCard` at ~28px / 700 with uppercase 12px labels. That is the one moment that feels like money.
2. **Onboarding is product-shaped.** Business name, GST/invoice-number explanation, skippable. No carousel.
3. **A few real guardrails.** Discard confirm on create. Mark-as-paid opens `PaymentCaptureModal`. Invoice empty state teaches ("Send it, get paid, GST-ready"). Native-stack + iOS `slide_from_bottom` for forms are already the right motion substrate.

## Priority Issues

**[P0] JS tab bar and fully custom headers**
- **What:** `AppNavigator` uses `@react-navigation/bottom-tabs` with `CustomTabBar`. `react-native-bottom-tabs` is not in `package.json`. Every stack preset sets `headerShown: false`. Feather icons, not SF Symbols. Search is a custom `TextInput` with 🔍.
- **Why it matters:** The app never feels like iOS/Android. No native tab selection, translucency, large titles, or UISearchController. This is the gap vs "native navigations tabs."
- **Fix:** Native bottom tabs (`@bottom-tabs/react-navigation`) with SF Symbols (`house`, `doc.text`, `creditcard`, `gearshape`). Show native headers. Large titles on Home / Invoices / Expenses / Settings. `headerSearchBarOptions` on the two lists. Delete `CustomTabBar` as the tab implementation.
- **Suggested command:** `impeccable craft native tabs and headers`

**[P0] Invoice Detail has no way out**
- **What:** `InvoiceDetailScreen` paints a `#1E2875` header with title + weekday only. `headerShown: false`, no back control.
- **Why it matters:** Users get stuck after opening an invoice. Support-level failure.
- **Fix:** Native header with back. Title = invoice number, not "Invoice Details" + today's weekday.
- **Suggested command:** `impeccable craft invoice detail native header`

**[P1] Home is a hero-metric dump, not a work surface**
- **What:** Greeting, weekday, Total Balance, 4 icon-less stat cards, Recent, Quick Stats. Net income three times. `totalExpenses = 0`. Recent rows are not tappable. Unused dashboard components.
- **Why it matters:** First session after onboarding does not teach the product. Trust dies on a fake bank balance (USD, expenses hardcoded 0).
- **Fix:** Light system chrome. One dark money card. One work list (overdue / draft). One primary create action. Drop Quick Stats and the 2x2 empty-square grid.
- **Suggested command:** `impeccable distill dashboard`

**[P1] Emoji is the icon language**
- **What:** Search 🔍, status 📝📤✓⚠️, Settings 🏢👤🔔🚪, auth 🔒⚡✨, FAB, detail bar, expense empty 💰. Detector: 45 hits / 22 files.
- **Why it matters:** Reads as prompt-generated, not a fintech system. VoiceOver announces emoji. Status is color + emoji.
- **Fix:** SF Symbols / vector icons only. Status = label + token color.
- **Suggested command:** `impeccable polish icons`

**[P1] Create invoice action cluster**
- **What:** FAB (📦✏️📋) + Cancel + 👁️ Preview + gradient ✓ Save, plus profile banner. Filters: 5 chips.
- **Why it matters:** More than 4 simultaneous choices on the money-making screen.
- **Fix:** Native header Cancel / Save. Preview after save or in header. Catalog add as a row action, not a FAB modal.
- **Suggested command:** `impeccable distill invoice create`

## Cognitive load

7 of 8 checklist items failed (grouping passed). High load. Invoice filters (5), create-invoice actions (4+), expense payment methods (6), Settings Profile wall of fields.

## Persona Red Flags

**Alex (Power User):** No bulk select, no native search. Swipe-to-status is hidden and one-at-a-time. Home recent rows do not navigate. ExpenseDetail is wired to the list. Settings Account/Notifications disabled. High abandonment after the first invoice list.

**Jordan (First-Timer):** First action on Home is not obvious when invoices exist (no +). Swipe affordance invisible. "Total Balance" vs invoices. First customer silently selected. Expense empty has no button. Two Settings rows say Coming Soon.

**Casey (Distracted Mobile):** Primary create on lists is a top-right "+ New" (not thumb zone). Custom tab bar is 48px icons but painted, not native. Invoice Detail has no advertised back. Sign out is one tap with no confirm. State of create forms is local; interruption risk.

**Sam (Accessibility):** Almost no `accessibilityLabel` outside the custom tab bar. Status is color + emoji. Password visibility is emoji-only. `GestureDetector` on buttons and swipe cards. White 60% labels on `#1a1f3a`. Custom tab bar is not a native tab bar (traits, selected state).

## Minor Observations

- Login logo uses `bg-primary` (HSL navy) while `ModernButton` is `#5B72EE` gradient. Same screen, two brands.
- Dashboard loading: `bg-revolut-blue-900` with `text-gray-600`.
- Currency: dashboard USD `en-US`; invoices NZD `$`. Header dates `en-US`; cards `en-NZ`.
- Sign out under "Danger Zone" with no confirm.
- `InvoiceCreateScreen` preview hardcodes `templateName: 'classic'`.
- Expense filters do not scroll; invoice filters do.

## Questions to Consider

- What if Home were only "what needs action" (drafts, overdue) instead of a bank-balance poster?
- Does this product want Revolut's light system chrome + one dark money card, or the current navy app shell? Those are different products.
- Would invoice create feel finished if the only persistent actions were Cancel and Save?
