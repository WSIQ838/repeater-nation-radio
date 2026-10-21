import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

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
  plugins: [
    base44({
      // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
      // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      hmrNotifier: true,
      navigationNotifier: true,
      analyticsTracker: true,
      visualEditAgent: true
    }),
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