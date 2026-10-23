import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Reuses the app's Supabase URL and anon key from the repo-root .env.local, so
// there is one place to change them. Only these two variables reach the page.
export default defineConfig({
  plugins: [react()],
  envDir: '..',
  envPrefix: ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'],
  server: { port: 5173, strictPort: true },
});
