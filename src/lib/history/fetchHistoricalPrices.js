/**
 * Pobieranie historycznych cen MIESIĘCZNYCH dla wykresów portfela w czasie.
 *
 * Źródło: Yahoo Finance — endpoint `/v8/finance/chart` przez proxy `/api/yahoo`.
 * (Stooq przestał udostępniać darmowe dane historyczne — endpoint `/q/d/l/` wymaga
 * teraz klucza API i zwraca instrukcję zamiast danych. Bieżące ceny Stooq nadal działają,
 * dlatego zmieniamy tylko źródło historii.)
 *
 * Zasada walutowa: ceny zwracamy w USD. Ceny w EUR (europejskie ETF-y notowane na XETRA)
 * przeliczamy BIEŻĄCYM kursem fx.eurToUsd — tak samo jak buildPortfolio dla cen bieżących.
 *
 * Symbole Yahoo:
 *  - akcje USA: ticker bez zmian (AAPL, MSFT, NVDA, AMZN, GOOGL...)
 *  - europejskie ETF-y: <TICKER>.DE (notowane w EUR)
 *  - krypto: <TICKER>-USD (BTC-USD, ETH-USD, SOL-USD)
 */

// Europejskie ETF-y → symbol Yahoo (notowane na XETRA, w EUR).
const YAHOO_ETF_SYMBOLS = {
  VWCE: 'VWCE.DE',
  EUNL: 'EUNL.DE',
  SXR8: 'SXR8.DE',
}

/**
 * Buduje symbol Yahoo dla danego tickera i typu.
 * Zwraca null gdy nie umiemy zmapować (obligacje, gotówka, metale — brak historii cen).
 */
function yahooSymbol(ticker, type) {
  const upper = ticker.toUpperCase()
  if (type === 'crypto') return `${upper}-USD`
  if (type === 'etf' && YAHOO_ETF_SYMBOLS[upper]) return YAHOO_ETF_SYMBOLS[upper]
  if (type === 'stock' || type === 'etf') return upper // akcje USA / ETF-y w USD
  return null
}

/**
 * Pobiera miesięczne ceny historyczne z Yahoo Finance dla jednego symbolu.
 * Zwraca Map<"YYYY-MM-DD", priceUSD> lub pustą mapę gdy się nie uda.
 *
 * Yahoo zwraca dla interwału miesięcznego punkty datowane na początek miesiąca,
 * a wartość Close to cena zamknięcia z końca tego miesiąca — dokładnie to,
 * czego potrzebuje rekonstrukcja portfela "na koniec miesiąca".
 *
 * eurToUsd: bieżący kurs do przeliczenia cen w EUR (gdy Yahoo zwróci walutę EUR).
 */
async function fetchYahooHistory(symbol, eurToUsd) {
  const dailyMap = new Map()
  try {
    const url = `/api/yahoo/v8/finance/chart/${encodeURIComponent(symbol)}?period1=0&period2=9999999999&interval=1mo`
    const res = await fetch(url)
    if (!res.ok) return dailyMap
    const data = await res.json()
    const result = data?.chart?.result?.[0]
    if (!result) return dailyMap

    const timestamps = result.timestamp
    const closes = result.indicators?.quote?.[0]?.close
    const currency = result.meta?.currency
    if (!Array.isArray(timestamps) || !Array.isArray(closes)) return dailyMap

    // Przelicznik na USD według waluty notowania.
    let toUsd = 1
    if (currency === 'EUR') {
      if (!eurToUsd) return dailyMap // brak kursu → nie potrafimy przeliczyć
      toUsd = eurToUsd
    } else if (currency && currency !== 'USD') {
      return dailyMap // nieobsługiwana waluta — nie zgadujemy
    }

    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i]
      if (typeof close !== 'number' || close <= 0) continue
      const dateStr = new Date(timestamps[i] * 1000).toISOString().slice(0, 10)
      dailyMap.set(dateStr, close * toUsd)
    }
  } catch {
    // Sieć/parsowanie zawiodło → puste dane, nie crash.
  }
  return dailyMap
}

/**
 * Główna funkcja — pobiera historyczne ceny dla listy pozycji.
 *
 * Parametry:
 *   positions: [{ ticker, type }]
 *   fx: { eurToUsd } (bieżący kurs)
 *
 * Zwraca: Map<ticker, Map<"YYYY-MM-DD", priceUSD>>
 *   Jeśli ticker zawiedzie lub nie ma historii → pusta wewnętrzna mapa.
 */
export async function fetchAllHistoricalPrices(positions, fx) {
  const result = new Map()
  const seen = new Set()
  const fetches = []

  for (const { ticker, type } of positions) {
    if (seen.has(ticker)) continue
    seen.add(ticker)

    const symbol = yahooSymbol(ticker, type)
    if (!symbol) {
      result.set(ticker, new Map()) // obligacje, gotówka, metale — brak historii cen
      continue
    }

    fetches.push(
      fetchYahooHistory(symbol, fx?.eurToUsd ?? null).then((dailyMap) => {
        result.set(ticker, dailyMap)
      }),
    )
  }

  await Promise.all(fetches)
  return result
}
