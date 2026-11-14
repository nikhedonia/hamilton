import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The production site is served from https://nikhedonia.net/hamilton/.
// Keep the dev server at the root for convenience.
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/hamilton/' : '/',
  plugins: [react()],
}))
