import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

// Identifies this build; src/lib/appUpdate.js compares it with the deployed
// /version.json so tabs left open for days pick up new code.
const BUILD_ID = new Date().toISOString();
const buildVersion = {
  name: 'rn-build-version',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
  },
};

// https://vite.dev/config/
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { proxy: { '/api': { target: 'http://localhost:8080', ws: true }, '/uploads': 'http://localhost:8080', '/functions': 'http://localhost:8080' } },
  plugins: [
    react(),
    buildVersion,
  ],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-radix': ['@radix-ui/react-dialog', '@radix-ui/react-popover', '@radix-ui/react-select', '@radix-ui/react-dropdown-menu'],
          'vendor-leaflet': ['leaflet', 'react-leaflet'],
          'vendor-charts': ['recharts'],
          'vendor-misc': ['lodash', 'date-fns', 'moment', 'framer-motion'],
        },
      },
    },
  },
});