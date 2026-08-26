import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Jobboks',
        short_name: 'Jobboks',
        description: 'Accounting on the go — for contractors, architects and engineers. jobboks.app',
        theme_color: '#1e3a8a',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        lang: 'is',
        categories: ['finance', 'business', 'productivity'],
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
        screenshots: [
          {
            src: 'screenshot-desktop.png',
            sizes: '1280x800',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Desktop dashboard',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4 MiB — Excel parser chunk is large
        // Prompt pattern: the new service worker WAITS until the user taps
        // "Uppfæra" in the update banner (UpdatePrompt.tsx), which then skip-waits
        // and reloads. This makes updates reliable and one-tap instead of the
        // old auto-update that could leave the app stuck on a stale cached build.
        clientsClaim: true,
        cleanupOutdatedCaches: true,

        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-cache' },
          },
        ],
      },
      devOptions: {
        // Off in dev: the service worker only caused stale-cache confusion while
        // iterating locally. Production still gets the full PWA from the build.
        enabled: false,
      },
    }),
  ],
  // Dev only — production is served by Netlify and is untouched by this.
  // The AI lives in Netlify functions (/api/claude) and an edge function
  // (/api/claude-stream), neither of which runs under `vite dev`. Without a
  // proxy the AI is simply dead locally, which makes testing a fresh empty app
  // pointless — the one thing you want to watch is how it reacts to an import
  // it has never seen. So point /api at the deployed site.
  server: {
    proxy: {
      '/api': { target: 'https://jobboks.app', changeOrigin: true, secure: true },
    },
  },
})
