import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Konfiguracja Vite — narzedzia, ktore uruchamiaja aplikacje lokalnie w przegladarce.
// Proxy dla Stooq: Stooq nie wysyla naglowkow CORS, wiec przeglądarka blokuje
// bezposrednie zapytania. Serwer deweloperski Vite posredniczy jako proxy —
// z punktu widzenia przegladarki to lokalne zapytanie (bez CORS).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/stooq': {
        target: 'https://stooq.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/stooq/, ''),
      },
    },
  },
})
