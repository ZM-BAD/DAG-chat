import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Empty prefix loads ALL env vars. Only map non-sensitive vars to define —
  // never expose API keys or passwords, they will be baked into the client bundle.
  const env = loadEnv(mode, '..', '');
  return {
    envDir: '..',
    define: {
      'import.meta.env.VITE_DEFAULT_USER_ID': JSON.stringify(
        env.DEFAULT_USER_ID || 'default-user',
      ),
    },
    plugins: [react()],
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
        'i18next-http-backend',
      ],
    },
  };
});
