export interface BusinessTheme {
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  textLight: string;
  background: string;
  surface: string;
}

/** Onboarding default. Matches the installed profile palette, including background. */
export const DEFAULT_THEME: BusinessTheme = {
  primary: '#163300',
  secondary: '#3B4DE6',
  accent: '#4F63D7',
  text: '#1E293B',
  textLight: '#64748B',
  background: '#F5F6F3',
  surface: '#FFFFFF',
};

/** Same invoice presets as the web ThemePicker. */
export const PRESET_THEMES: Record<string, BusinessTheme> = {
  blue: {
    primary: '#3B82F6',
    secondary: '#06B6D4',
    accent: '#10B981',
    text: '#111827',
    textLight: '#6B7280',
    background: '#F9FAFB',
    surface: '#FFFFFF',
  },
  purple: {
    primary: '#8B5CF6',
    secondary: '#A855F7',
    accent: '#EC4899',
    text: '#111827',
    textLight: '#6B7280',
    background: '#FAF5FF',
    surface: '#FFFFFF',
  },
  green: {
    primary: '#10B981',
    secondary: '#059669',
    accent: '#F59E0B',
    text: '#111827',
    textLight: '#6B7280',
    background: '#F0FDF4',
    surface: '#FFFFFF',
  },
  red: {
    primary: '#EF4444',
    secondary: '#F97316',
    accent: '#8B5CF6',
    text: '#111827',
    textLight: '#6B7280',
    background: '#FEF2F2',
    surface: '#FFFFFF',
  },
  pink: {
    primary: '#EC4899',
    secondary: '#F472B6',
    accent: '#8B5CF6',
    text: '#1F2937',
    textLight: '#6B7280',
    background: '#FDF2F8',
    surface: '#FFFFFF',
  },
  slate: {
    primary: '#475569',
    secondary: '#64748B',
    accent: '#0EA5E9',
    text: '#0F172A',
    textLight: '#64748B',
    background: '#F8FAFC',
    surface: '#FFFFFF',
  },
};

export const PRESET_THEME_CHOICES = [
  { key: 'blue', label: 'Blue' },
  { key: 'purple', label: 'Purple' },
  { key: 'green', label: 'Green' },
  { key: 'red', label: 'Red' },
  { key: 'pink', label: 'Pink' },
  { key: 'slate', label: 'Slate' },
] as const;

export const THEME_COLOR_FIELDS: { key: keyof BusinessTheme; label: string }[] = [
  { key: 'primary', label: 'Primary' },
  { key: 'secondary', label: 'Secondary' },
  { key: 'accent', label: 'Accent' },
  { key: 'text', label: 'Text' },
  { key: 'textLight', label: 'Light text' },
  { key: 'background', label: 'Background' },
  { key: 'surface', label: 'Surface' },
];

const HEX_COLOUR = /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

export function isHexColor(value: string): boolean {
  return HEX_COLOUR.test(value.trim());
}

export function themeFieldError(value: string): string | undefined {
  return isHexColor(value) ? undefined : 'Enter a hex colour like #3B82F6.';
}

export function normalizeBusinessTheme(value?: Partial<BusinessTheme> | null): BusinessTheme {
  return {
    primary: value?.primary?.trim() || DEFAULT_THEME.primary,
    secondary: value?.secondary?.trim() || DEFAULT_THEME.secondary,
    accent: value?.accent?.trim() || DEFAULT_THEME.accent,
    text: value?.text?.trim() || DEFAULT_THEME.text,
    textLight: value?.textLight?.trim() || DEFAULT_THEME.textLight,
    background: value?.background?.trim() || DEFAULT_THEME.background,
    surface: value?.surface?.trim() || DEFAULT_THEME.surface,
  };
}

/** Contract colours only. Drops keys the API strips, such as `name`. */
export function toContractTheme(theme: Partial<BusinessTheme>): BusinessTheme {
  return {
    primary: theme.primary?.trim() || DEFAULT_THEME.primary,
    secondary: theme.secondary?.trim() || DEFAULT_THEME.secondary,
    accent: theme.accent?.trim() || DEFAULT_THEME.accent,
    text: theme.text?.trim() || DEFAULT_THEME.text,
    textLight: theme.textLight?.trim() || DEFAULT_THEME.textLight,
    background: theme.background?.trim() || DEFAULT_THEME.background,
    surface: theme.surface?.trim() || DEFAULT_THEME.surface,
  };
}

export function themesMatch(left: BusinessTheme, right: BusinessTheme): boolean {
  return (Object.keys(left) as (keyof BusinessTheme)[]).every(
    (key) => left[key].trim().toLowerCase() === right[key].trim().toLowerCase(),
  );
}

export function previewTheme(theme: BusinessTheme): BusinessTheme {
  return {
    primary: isHexColor(theme.primary) ? theme.primary.trim() : DEFAULT_THEME.primary,
    secondary: isHexColor(theme.secondary) ? theme.secondary.trim() : DEFAULT_THEME.secondary,
    accent: isHexColor(theme.accent) ? theme.accent.trim() : DEFAULT_THEME.accent,
    text: isHexColor(theme.text) ? theme.text.trim() : DEFAULT_THEME.text,
    textLight: isHexColor(theme.textLight) ? theme.textLight.trim() : DEFAULT_THEME.textLight,
    background: isHexColor(theme.background) ? theme.background.trim() : DEFAULT_THEME.background,
    surface: isHexColor(theme.surface) ? theme.surface.trim() : DEFAULT_THEME.surface,
  };
}
