/**
 * Pobieranie aktualnych cen aktywów i kursów walut z darmowych źródeł publicznych.
 *
 * Zasada walutowa projektu: wszystkie ceny zwracamy w USD.
 * Przeliczenie na PLN odbywa się wyłącznie przy wyświetlaniu (w komponentach).
 *
 * Źródła:
 *  - Ceny aktywów (akcje, ETF-y, krypto): Yahoo Finance przez proxy Vite
 *      (/api/yahoo → https://query1.finance.yahoo.com). Jedno źródło dla wszystkich
 *      rodzajów aktywów — daje cenę bieżącą oraz cenę otwarcia dnia.
 *  - Kursy walut (FX): Frankfurter (dane EBC) — kurs USD→PLN i EUR→USD.
 *  - Obligacje (bond), gotówka (cash), metale (precious_metal): brak publicznego
 *      cennika → null.
 *
 * Dlaczego Yahoo dla wszystkiego:
 *  - Stooq zablokował darmowe dane historyczne (wymaga klucza API).
 *  - CoinGecko (darmowe) ogranicza historię do 365 dni — za mało dla wieloletniego portfela.
 *  - Yahoo jednym endpointem obsługuje akcje, ETF-y i krypto (bieżące i historyczne),
 *    więc trzymamy jedno spójne źródło zamiast trzech.
 *
 * Symbole Yahoo:
 *  - akcje USA: ticker bez zmian (AAPL, MSFT, ...)
 *  - europejskie ETF-y: <TICKER>.DE (notowane w EUR — przeliczane na USD)
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
 * Zwraca null gdy aktywo nie ma ceny rynkowej (obligacje, gotówka, metale).
 */
function yahooSymbol(ticker, type) {
  const upper = ticker.toUpperCase()
  if (type === 'crypto') return `${upper}-USD`
  if (type === 'etf' && YAHOO_ETF_SYMBOLS[upper]) return YAHOO_ETF_SYMBOLS[upper]
  if (type === 'stock' || type === 'etf') return upper // akcje USA / ETF-y w USD
  return null
}

/**
 * Pobiera bieżące kursy walutowe z Frankfurter (dane EBC).
 * Zwraca obiekt { usdToPln, eurToUsd } lub null gdy zapytanie się nie powiedzie.
 */
export async function fetchFxRates() {
  try {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=PLN,EUR')
    if (!res.ok) return null
    const data = await res.json()
    const usdToPln = data?.rates?.PLN ?? null
    const eurRate = data?.rates?.EUR ?? null
    // EUR/USD: ile USD kosztuje 1 EUR = 1 / (ile EUR za 1 USD)
    const eurToUsd = eurRate ? 1 / eurRate : null
    return { usdToPln, eurToUsd }
  } catch {
    return null
  }
}

/**
 * Pobiera z Yahoo Finance bieżącą cenę i cenę otwarcia dnia dla jednego symbolu.
 * Zwraca { priceUSD, openUSD } (każde number|null) lub null gdy zapytanie zawiedzie.
 *
 * Używamy interwału dziennego z zakresem kilku dni — ostatnia świeca to dzisiejsza
 * (lub ostatnia sesja): jej Open = cena otwarcia, a bieżącą cenę bierzemy z
 * meta.regularMarketPrice (najbardziej aktualna). Ceny w EUR przeliczamy bieżącym
 * kursem eurToUsd.
 */
async function fetchYahooQuote(symbol, eurToUsd) {
  try {
    const url = `/api/yahoo/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const result = data?.chart?.result?.[0]
    if (!result) return null

    const currency = result.meta?.currency
    const quote = result.indicators?.quote?.[0]
    const closes = quote?.close
    const opens = quote?.open
    if (!Array.isArray(closes)) return null

    // Ostatni dzień z poprawną ceną zamknięcia.
    let lastIdx = closes.length - 1
    while (lastIdx >= 0 && typeof closes[lastIdx] !== 'number') lastIdx--
    if (lastIdx < 0) return null

    const currentNative =
      typeof result.meta?.regularMarketPrice === 'number'
        ? result.meta.regularMarketPrice
        : closes[lastIdx]
    const openNative = typeof opens?.[lastIdx] === 'number' ? opens[lastIdx] : null

    // Przelicznik na USD według waluty notowania.
    let toUsd = 1
    if (currency === 'EUR') {
      if (!eurToUsd) return null
      toUsd = eurToUsd
    } else if (currency && currency !== 'USD') {
      return null // nieobsługiwana waluta — nie zgadujemy
    }

    const priceUSD = currentNative > 0 ? currentNative * toUsd : null
    const openUSD = openNative !== null && openNative > 0 ? openNative * toUsd : null
    return { priceUSD, openUSD }
  } catch {
    return null
  }
}

/**
 * Główna funkcja pobierająca ceny dla całego portfela.
 *
 * Przyjmuje listę pozycji (każda: { ticker, type }) i zestaw callbacków:
 *   onProgress(done, total, succeeded, failed) — wywoływane po każdym fetchu
 *   onDone(pricesUSD, openPricesUSD) — po zakończeniu wszystkich
 *     pricesUSD: Map<ticker, number|null> — bieżące ceny w USD
 *     openPricesUSD: Map<ticker, number|null> — ceny otwarcia dnia w USD
 *
 * Dla każdego tickera cena to liczba w USD lub null (brak ceny).
 * Obligacje, gotówka i metale → zawsze null (brak publicznego cennika).
 */
export async function fetchAllPrices(positions, onProgress, onDone) {
  const pricesUSD = new Map()
  const openPricesUSD = new Map()

  // Unikalne tickery; rozdziel na te z ceną (Yahoo) i bez ceny.
  const priceable = []
  const seen = new Set()
  for (const { ticker, type } of positions) {
    if (seen.has(ticker)) continue
    seen.add(ticker)
    const symbol = yahooSymbol(ticker, type)
    if (symbol) {
      priceable.push({ ticker, symbol })
    } else {
      // obligacje, gotówka, metale — brak publicznej ceny
      pricesUSD.set(ticker, null)
      openPricesUSD.set(ticker, null)
    }
  }

  const total = priceable.length
  let done = 0
  let succeeded = 0
  let failed = 0

  if (total === 0) {
    onDone(pricesUSD, openPricesUSD)
    return null
  }

  // Kurs FX — potrzebny do przeliczenia ETF-ów z EUR na USD.
  const fx = await fetchFxRates()

  // Pobierz ceny wszystkich aktywów równolegle, aktualizując postęp po każdym.
  const fetches = priceable.map(async ({ ticker, symbol }) => {
    const quote = await fetchYahooQuote(symbol, fx?.eurToUsd ?? null)
    const priceUSD = quote?.priceUSD ?? null
    const openUSD = quote?.openUSD ?? null

    pricesUSD.set(ticker, priceUSD)
    openPricesUSD.set(ticker, openUSD)
    done++
    if (priceUSD !== null) succeeded++
    else failed++
    onProgress(done, total, succeeded, failed)
  })

  await Promise.all(fetches)
  onDone(pricesUSD, openPricesUSD)

  return fx
}
