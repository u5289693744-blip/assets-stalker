import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Konfiguracja Vite — narzedzia, ktore uruchamiaja aplikacje lokalnie w przegladarce.
export default defineConfig({
  plugins: [react()],
})
