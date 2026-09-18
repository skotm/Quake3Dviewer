import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` makes the build use relative asset paths, so the app works
// whether it's served at https://<user>.github.io/ or
// https://<user>.github.io/<repo-name>/ without any extra configuration.
export default defineConfig({
  plugins: [react()],
  base: './',
});
