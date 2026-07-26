import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Dev: proxy the backend API paths to the Go server so the browser app
    // talks to the same origin (no CORS). The client uses relative URLs
    // (VITE_API_URL defaults to '').
    proxy: {
      '/graphs': 'http://localhost:8080',
      '/health': 'http://localhost:8080',
    },
  },
})
