import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFileSync } from "node:fs";
const buildVersion = JSON.parse(readFileSync(new URL("./public/version.json", import.meta.url), "utf8"));
import { componentTagger } from "lovable-tagger";
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(buildVersion.version),
    "import.meta.env.VITE_BUILD_HASH": JSON.stringify(buildVersion.hash),
    "import.meta.env.VITE_BUILD_TIME": JSON.stringify(String(buildVersion.buildTime)),
    // Development environment flags
    __DEV_MODE__: mode === 'development',
    __VERSION_POLLING_ENABLED__: mode === 'production',
    __FOCUS_CHECKS_ENABLED__: mode === 'production',
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Aggressive cache busting strategies
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/') || url.pathname.startsWith('/shared/invoice/'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/api\./,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|ico)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'images',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
              },
            },
          },
        ],
        // Exclude files that should always be fresh
        navigateFallbackDenylist: [/^\/shared\/invoice\//, /^\/_/, /\/[^/?]+\.[^/]+$/, /^\/api\//],
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'EasyBizInvoice',
        short_name: 'EasyBizInvoice',
        description: 'EasyBizInvoice: Effortless invoicing and business management for modern entrepreneurs. Visit easybizinvoice.com',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      // Force update check on app focus
      devOptions: {
        enabled: false,
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@ledgercraft/contracts": path.resolve(__dirname, "./packages/contracts/src/index.ts"),
    },
  },
}));
