import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  // server: {
  //   allowedHosts: [
  //     '9bae-2409-40e7-8-ed50-d092-215d-adbe-6017.ngrok-free.app'
  //   ]
  // }

  // server: {proxy: { '/api': 'http://0.0.0.0:5000' }}
})
