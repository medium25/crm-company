import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Все импорты 'firebase/firestore' в приложении идут через обёртку со счётчиком чтений
    // (раздел «Расход Firebase», см. src/lib/firestoreMetered.js).
    alias: [{ find: /^firebase\/firestore$/, replacement: fileURLToPath(new URL('./src/lib/firestoreMetered.js', import.meta.url)) }],
  },
  base: './',
  build: {
    assetsDir: '.',
  },
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
})
