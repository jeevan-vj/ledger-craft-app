# LedgerCraft design systems

LedgerCraft uses two related, platform-specific systems. The web application takes cues from Revolut's clarity and high-contrast financial tooling. The native application takes cues from Wise's warm confidence and directness. They share product semantics, but they do not share rendering primitives or imitate either company's marks, wordmarks, or proprietary assets.

## Shared product principles

- Make money legible. Monetary values use tabular numerals, strong hierarchy, and explicit labels.
- Prefer one obvious action. Primary actions are visually dominant; secondary actions remain quiet.
- Use color semantically. Brand color guides action and selection, never large quantities of decoration.
- Reduce container noise. Group related content with spacing before adding another card.
- Keep states complete. Every component covers focus, pressed, disabled, loading, empty, and error states.
- Meet WCAG AA for text and controls. Do not place white body-sized text on bright brand colors that fail contrast.

## Web: LedgerCraft Revolut

The web system is an efficient desktop-first operating surface with a cool neutral canvas, white working surfaces, near-black ink, and electric blue focus. Its canonical CSS tokens live in `src/design-system/revolut.css`; Tailwind maps semantic names in `tailwind.config.ts`.

### Color roles

| Role | Token | Intent |
| --- | --- | --- |
| Canvas | `background` | Quiet application background |
| Surface | `card`, `popover` | Content and floating controls |
| Ink | `foreground` | Primary copy and financial values |
| Action | `primary` | Buttons, active navigation, selected controls |
| Brand accent | `brand` | Focus, selection, small moments of emphasis |
| Soft emphasis | `accent` | Selected rows, quiet callouts, hover surfaces |
| Supporting copy | `muted-foreground` | Descriptions and metadata |
| Status | `success`, `warning`, `info`, `destructive` | Meaning only; never decoration |
| Data series | `chart-1` … `chart-5` | Charts only; keep labels and tooltips explicit |

Use semantic utilities such as `bg-primary`, `text-muted-foreground`, and `border-border`. Do not add feature-specific hex values to product UI. Invoice templates are deliberately isolated because their printable themes are customer content.

### Shape, depth, and type

- Cards and working panels use 16px corners. Small fields use 12px corners. Compact action controls may be pills.
- Use `shadow-surface` for a raised white surface. Do not combine it with a visible border.
- Page titles are 30–36px, bold, and tightly tracked. Body copy stays 14–16px with a maximum reading measure of 65–75 characters.
- Tables and monetary data use tabular numerals. Uppercase is reserved for genuinely short metadata, not headings.

### Core components

- `Button`: default, secondary, outline, ghost, destructive, and link actions.
- `Input`: muted resting fill, white focused surface, visible blue focus ring.
- `Card` / `ContentPanel`: raised working surfaces with consistent radius and depth.
- `Badge`: neutral and semantic status variants.
- `SegmentedControl`: local view switching, not primary navigation.
- `EmptyState`: one explanation and one useful next action.

## Mobile: LedgerCraft Wise

The mobile system is native-first, spacious, and direct. It follows the system appearance: a dark canvas with light ink, or a warm grouped canvas with forest ink. Lime stays the action color in both. Canonical runtime tokens live in `mobile/src/theme/tokens.ts` (`darkPalette` and `lightPalette`); screens read them through `useTheme()`. Navigation consumes the active palette through `mobile/src/theme/navigation.ts`.

### Color roles

| Role | Token | Intent |
| --- | --- | --- |
| Canvas | `palette.background` | iOS-style grouped background |
| Surface | `palette.surface` | Lists, forms, and sheets |
| Ink | `palette.text` | Primary text. Forest in light mode, off-white in dark mode |
| Action | `palette.accent` | Lime primary controls, selection, and indicators on dark chrome |
| Action ink | `palette.accentForeground` | Forest text on lime only; never white, and never on dark surfaces |
| Emphasis | `palette.accentText` | Lime or forest emphasis for text and icons that sit on canvas, cards, or accent fill |
| Fill | `palette.fill`, `palette.fillMuted` | Secondary controls and fields |
| Separator | `palette.separator` | Hairline grouping only |
| Status | `danger`, `success`, `warning` | Meaning only |

### Native behavior

- Preserve platform navigation: iOS large titles, system back gestures, modal form presentation, and Liquid Glass-compatible bars.
- The app root owns `SafeAreaProvider`. Headerless screens use its top inset, large-title scroll containers opt into automatic inset adjustment, and tab-hosted screens reserve the measured native tab-bar height through `useTabScreenInsets()`.
- Fixed bottom actions sit above the native tab bar and measure themselves so the final scroll content clears both the action surface and tab bar. Do not use magic footer spacers.
- Every target is at least 44pt. Primary controls are 48–56pt high and pill-shaped.
- Use `GroupedSection` and `ListRow` for settings-style information. Avoid cards inside grouped cards.
- Use light haptics on deliberate actions, not every scroll or navigation event.
- Motion is brief: 140ms for feedback, 220ms for navigation, 320ms for deliberate transitions. Respect reduced motion.

### Core components

- `ModernButton` is the expressive primary button; `ActionButton` is the compact compatibility primitive. Both use lime with forest text.
- `ModernInput` and `FormInput` share muted resting fills, surface focus, and explicit errors.
- `GroupedSection`, `ListRow`, `IconWell`, `QuickAction`, and `EmptyState` form the native content grammar.
- `SelectionSheet` and `SelectionRow` are the standard searchable picker pattern: page-sheet presentation, one grouped list, 44pt minimum controls, accessible selected state, and forest checks on lime.

## Contribution rules

1. Choose the semantic role before choosing a color.
2. Reuse an existing primitive when the intent matches; extract a new component only after the pattern repeats.
3. Keep web and React Native components separate. Shared DTOs do not imply shared UI primitives.
4. Verify light/dark web themes and supported mobile device classes after visual changes.
5. New primitives require typed props, accessibility state, loading/disabled behavior, and a usage note in this document.
