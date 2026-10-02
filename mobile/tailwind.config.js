/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        invoice: {
          dark: '#1A1F2C',
          primary: '#33415C',
          teal: '#5BC0BE',
          coral: '#F25F5C'
        },
        lime: {
          50: '#F4FBE8',
          100: '#E8F8D8',
          200: '#D4F2B0',
          300: '#C4EE96',
          400: '#B0EA7E',
          500: '#9FE870',
          600: '#7BC24E',
          700: '#163300',
          800: '#122800',
          900: '#0E2E10',
          950: '#0A1F0A'
        },
        ios: {
          grouped: '#F5F6F3',
          fill: '#EDEDED',
        },
        wise: {
          forest: '#163300',
          lime: '#9FE870',
          'lime-pressed': '#8FDC62',
          canvas: '#F5F6F3',
          surface: '#FFFFFF',
          fill: '#EDEDED',
          muted: '#62605B',
        },
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      }
    }
  },
  plugins: [],
};
