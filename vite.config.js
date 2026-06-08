import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Konfiguracja Vite — narzedzia, ktore uruchamiaja aplikacje lokalnie w przegladarce.
// Proxy dla Yahoo Finance: Yahoo nie wysyla naglowkow CORS, wiec przeglądarka blokuje
// bezposrednie zapytania. Serwer deweloperski Vite posredniczy jako proxy —
// z punktu widzenia przegladarki to lokalne zapytanie (bez CORS).
// (CoinGecko i Frankfurter sa wolane bezposrednio — wysylaja naglowki CORS.)
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/yahoo': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/yahoo/, ''),
        // Yahoo odrzuca (429) zapytania z niektorymi naglowkami User-Agent
        // (m.in. Firefoksa). Wysylamy do Yahoo staly, akceptowany podpis
        // przegladarki, niezaleznie od tego, czego uzywa uzytkownik.
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader(
              'User-Agent',
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            )
          })
        },
      },
    },
  },
})
