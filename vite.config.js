import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env     = loadEnv(mode, process.cwd(), '');
  const useMock = env.VITE_USE_MOCK === 'true';

  return {
    plugins: [react()],
    resolve: {
      alias: useMock
        ? {
            'firebase/app':      path.resolve('./src/mock/app.js'),
            'firebase/auth':     path.resolve('./src/mock/auth.js'),
            'firebase/database': path.resolve('./src/mock/database.js'),
          }
        : {},
    },
  };
});
