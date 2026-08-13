import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
      hmr: (process.env.AIS_DEV_URL || process.env.PORT || process.env.K_SERVICE) ? {
        protocol: 'wss',
        clientPort: 443,
        overlay: false,
      } : {
        protocol: 'ws',
        host: 'localhost',
        port: 3000,
        overlay: false,
      },
      watch: {
        usePolling: true,
        interval: 1000,
      },
    },
  };
});
