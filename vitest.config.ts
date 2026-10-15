import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    env: {
      VITE_CUSTOMERS_API: 'false',
      VITE_BUSINESS_API: 'false',
      VITE_ITEMS_API: 'false',
      VITE_INVOICES_API: 'false',
      VITE_EXPENSES_API: 'false',
      VITE_PAYMENTS_API: 'false',
      VITE_ACCOUNTS_API: 'false',
      VITE_BANK_API: 'false',
      VITE_RECONCILIATION_API: 'false',
      VITE_TAX_API: 'false',
      VITE_STORAGE_API: 'false',
      VITE_RECEIPTS_API: 'false',
      VITE_AI_API: 'false',
      VITE_CONVERSATIONS_API: 'false',
      VITE_JOURNALS_API: 'false',
    },
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/coverage/**',
        'src/main.tsx',
        'src/vite-env.d.ts'
      ]
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@ledgercraft/contracts': path.resolve(__dirname, './packages/contracts/src/index.ts'),
    },
  },
})