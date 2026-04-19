import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:3001'
    }
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['Captain_Blue_Logo.png'],
      manifest: {
        name: 'Captain Blue',
        short_name: 'Capt Blue',
        description: 'The Blue Anchor AI Concierge',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone',
        icons: [
          {
            src: 'Captain_Blue_Logo.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'Captain_Blue_Logo.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
})
