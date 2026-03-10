import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'

const version = fs.readFileSync('VERSION', 'utf-8').trim()

export default defineConfig({
  base: '/hideGantt/',
  plugins: [react(), tailwindcss()],
  define: {
    'import.meta.env.APP_VERSION': JSON.stringify(version),
  },
})
