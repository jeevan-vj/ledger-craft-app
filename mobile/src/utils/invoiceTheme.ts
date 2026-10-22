import { DEFAULT_THEME } from '@/types/onboarding';

/** Colour tokens shared with web invoice templates. */
export interface InvoiceTheme {
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  textLight: string;
  background: string;
  surface: string;
}

/**
 * Mobile businesses persist this palette, including the shared canvas
 * background `#F5F6F3`. Web uses the same token roles for a stored theme.
 */
export const DEFAULT_INVOICE_THEME: InvoiceTheme = {
  primary: DEFAULT_THEME.primary,
  secondary: DEFAULT_THEME.secondary,
  accent: DEFAULT_THEME.accent,
  text: DEFAULT_THEME.text,
  textLight: DEFAULT_THEME.textLight,
  background: DEFAULT_THEME.background,
  surface: DEFAULT_THEME.surface,
};

export type InvoiceThemeInput = Partial<{
  [Key in keyof InvoiceTheme]: string | null | undefined;
}> | null | undefined;

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function usableHex(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return HEX_COLOR.test(trimmed) ? trimmed : undefined;
}

function expandHex(color: string): string {
  const digits = color.slice(1);
  const six = digits.length === 3
    ? digits.split('').map((channel) => channel + channel).join('')
    : digits.slice(0, 6);
  return `#${six}`;
}

function channel(value: number): number {
  const unit = value / 255;
  return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string): number {
  const hex = expandHex(color);
  const red = channel(parseInt(hex.slice(1, 3), 16));
  const green = channel(parseInt(hex.slice(3, 5), 16));
  const blue = channel(parseInt(hex.slice(5, 7), 16));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

/** White on a brand fill when it stays readable, otherwise dark ink. */
export function readableInk(background: string): string {
  const white = '#FFFFFF';
  const dark = '#111827';
  if (contrastRatio(white, background) >= 3) return white;
  return dark;
}

function lighterColor(first: string, second: string): string {
  return luminance(first) >= luminance(second) ? first : second;
}

export function withAlpha(color: string, alpha: number): string {
  const hex = expandHex(color);
  const red = parseInt(hex.slice(1, 3), 16);
  const green = parseInt(hex.slice(3, 5), 16);
  const blue = parseInt(hex.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/** Fills any missing or invalid theme token from the shared default palette. */
export function resolveInvoiceTheme(theme?: InvoiceThemeInput): InvoiceTheme {
  const source = theme && typeof theme === 'object' ? theme : undefined;
  return {
    primary: usableHex(source?.primary) ?? DEFAULT_INVOICE_THEME.primary,
    secondary: usableHex(source?.secondary) ?? DEFAULT_INVOICE_THEME.secondary,
    accent: usableHex(source?.accent) ?? DEFAULT_INVOICE_THEME.accent,
    text: usableHex(source?.text) ?? DEFAULT_INVOICE_THEME.text,
    textLight: usableHex(source?.textLight) ?? DEFAULT_INVOICE_THEME.textLight,
    background: usableHex(source?.background) ?? DEFAULT_INVOICE_THEME.background,
    surface: usableHex(source?.surface) ?? DEFAULT_INVOICE_THEME.surface,
  };
}

export function invoiceDocumentCss(theme: InvoiceTheme): string {
  const onPrimary = readableInk(theme.primary);
  const onSecondary = readableInk(theme.secondary);
  const onAccent = readableInk(theme.accent);
  const onGradient = readableInk(lighterColor(theme.primary, theme.secondary));
  const onTextLight = readableInk(theme.textLight);
  return `
    :root {
      --inv-primary: ${theme.primary};
      --inv-secondary: ${theme.secondary};
      --inv-accent: ${theme.accent};
      --inv-text: ${theme.text};
      --inv-text-light: ${theme.textLight};
      --inv-background: ${theme.background};
      --inv-surface: ${theme.surface};
      --inv-on-primary: ${onPrimary};
      --inv-on-secondary: ${onSecondary};
      --inv-on-accent: ${onAccent};
      --inv-on-gradient: ${onGradient};
      --inv-on-text-light: ${onTextLight};
      --inv-border: ${withAlpha(theme.textLight, 0.28)};
    }
    .discount-value { color: var(--inv-accent); }
    @page { size: 595px 842px; margin: 0; }
    html {
      width: 595px;
      min-height: 842px;
      background: var(--inv-background);
      -webkit-text-size-adjust: 100%;
    }
    body {
      width: 595px;
      min-height: 842px;
      overflow-x: hidden;
    }
    .notes-text, .terms-text {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  `;
}
