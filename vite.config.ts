import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Same-origin API: /api/* is forwarded to the FastAPI backend, so no CORS
// configuration is needed. Applied to `preview` as well as `dev` because the
// end-to-end suite runs against the production build — testing the bundle that
// actually ships, not a dev-only variant of it.
const apiProxy = {
  '/api': {
    target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:8000',
    changeOrigin: true,
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
})
