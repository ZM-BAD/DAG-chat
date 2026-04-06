import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react({
      // React 19+ uses the new JSX runtime by default
      jsxImportSource: 'react',
      babel: {
        plugins: [
          // Add any Babel plugins here if needed
        ]
      }
    })
  ],
  server: {
    port: 3000,
    open: false,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2024',
    sourcemap: true,
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-i18next',
      'i18next',
      'i18next-http-backend'
    ]
  }
})
