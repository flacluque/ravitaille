import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // PWA : l'appli et le dernier plan consulté restent disponibles sans réseau (le jour J, en montagne).
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Trail Planner',
        short_name: 'Trail Planner',
        description: 'Heures de passage, ravitos et barrières horaires de ta course',
        lang: 'fr',
        theme_color: '#1f4d3a',
        background_color: '#f6f4ef',
        display: 'standalone',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: { cacheName: 'api', networkTimeoutSeconds: 5, expiration: { maxEntries: 50 } },
          },
          {
            // Seules les tuiles déjà affichées sont gardées : pas de préchargement (règles d'usage OSM).
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tuiles-osm',
              expiration: { maxEntries: 2000, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    // En dev, l'API Spring tourne à côté (mvn spring-boot:run).
    proxy: { '/api': 'http://localhost:8080' },
  },
  test: {
    environment: 'node',
  },
});
