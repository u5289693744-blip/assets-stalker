/**
 * Pobieranie aktualnych cen i kursów walut z darmowych źródeł publicznych.
 *
 * Zasada walutowa projektu: wszystkie ceny zwracamy w USD.
 * Przeliczenie na PLN odbywa się wyłącznie przy wyświetlaniu (w komponentach).
 *
 * Źródła:
 *  - Krypto (type=crypto): CoinGecko — zwraca USD bezpośrednio, CORS ok.
 *  - Akcje i ETF-y (type=stock, type=etf): Stooq przez proxy Vite
 *      (/api/stooq → https://stooq.com). Symbole .us → cena w USD,
 *      symbole .de → cena w EUR (przeliczamy na USD).
 *  - FX: Frankfurter (dane EBC) — kurs USD→PLN i EUR→USD.
 *  - Obligacje (bond), gotówka (cash): brak publicznego cennika → null.
 */

// Mapa: ticker krypto → id w CoinGecko.
const COINGECKO_IDS = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
}

// Mapa: ticker ETF → symbol Stooq (rynek europejski, ceny w EUR).
const STOOQ_ETF_SYMBOLS = {
  VWCE: 'vwce.de',
  EUNL: 'eunl.de',
  SXR8: 'sxr8.de',
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
 * Pobiera ceny kryptowalut z CoinGecko dla podanego zbioru tickerów.
 * Zwraca obiekt { prices: Map<ticker, priceUSD>, opens: Map<ticker, openPriceUSD> }.
 *
 * Cena otwarcia (przybliżona) liczona ze zmiany dobowej:
 *   openPriceUSD = currentPrice / (1 + usd_24h_change / 100)
 * CoinGecko nie zwraca dosłownie ceny otwarcia sesji — to przybliżenie z 24h temu.
 */
async function fetchCryptoPrices(tickers) {
  const prices = new Map()
  const opens = new Map()
  const ids = tickers
    .map((t) => ({ ticker: t, id: COINGECKO_IDS[t.toUpperCase()] }))
    .filter((x) => x.id)

  if (ids.length === 0) return { prices, opens }

  try {
    const idList = ids.map((x) => x.id).join(',')
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${idList}&vs_currencies=usd&include_24hr_change=true`
    const res = await fetch(url)
    if (!res.ok) return { prices, opens }
    const data = await res.json()
    for (const { ticker, id } of ids) {
      const price = data?.[id]?.usd
      const change24h = data?.[id]?.usd_24h_change
      if (typeof price === 'number') {
        prices.set(ticker.toUpperCase(), price)
        // Przybliżona cena 24h temu (jako "open")
        if (typeof change24h === 'number' && change24h !== -100) {
          opens.set(ticker.toUpperCase(), price / (1 + change24h / 100))
        }
      }
    }
  } catch {
    // Sieć zawodzi — zwracamy puste mapy (brak ceny, nie crash).
  }
  return { prices, opens }
}

/**
 * Pobiera cenę otwarcia i zamknięcia jednego aktywa ze Stooq przez proxy Vite.
 * Zwraca { close, open } lub null gdy się nie uda.
 * symbol: np. "aapl.us" (USD) lub "vwce.de" (EUR)
 *
 * Format CSV ze Stooq: Symbol,Date,Time,Open,High,Low,Close,Volume
 *   indeks 3 = Open, indeks 6 = Close
 */
async function fetchStooqPrice(symbol) {
  try {
    const url = `/api/stooq/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`
    const res = await fetch(url)
    if (!res.ok) return null
    const text = await res.text()
    const lines = text.trim().split('\n')
    if (lines.length < 2) return null
    const values = lines[1].split(',')
    const open = parseFloat(values[3])
    const close = parseFloat(values[6])
    if (isNaN(close) || close <= 0) return null
    return {
      close,
      open: isNaN(open) || open <= 0 ? null : open,
    }
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
 *     pricesUSD: Map<ticker, number|null> — ceny zamknięcia w USD
 *     openPricesUSD: Map<ticker, number|null> — ceny otwarcia dnia w USD
 *       (Stooq: Open z CSV; krypto: przybliżenie z 24h change CoinGecko)
 *
 * Dla każdego tickera cena to liczba w USD lub null (brak ceny).
 * Obligacje i gotówka → zawsze null (brak publicznego cennika).
 */
export async function fetchAllPrices(positions, onProgress, onDone) {
  // Zbieramy unikalne tickery według typu (jeden ticker może być u wielu brokerów).
  const cryptoTickers = []
  const stockEtfTickers = []

  const seen = new Set()
  for (const { ticker, type } of positions) {
    if (seen.has(ticker)) continue
    seen.add(ticker)
    if (type === 'crypto') cryptoTickers.push(ticker)
    else if (type === 'stock' || type === 'etf') stockEtfTickers.push(ticker)
    // bond, cash, precious_metal → brak ceny
  }

  const total = cryptoTickers.length + stockEtfTickers.length
  let done = 0
  let succeeded = 0
  let failed = 0

  // Wynik zbiorczy: ticker → priceUSD | null
  const pricesUSD = new Map()
  // Ceny otwarcia dnia: ticker → openPriceUSD | null
  const openPricesUSD = new Map()

  // Wypełnij null dla wszystkich tickerów bez cennika (obligacje, gotówka itp.).
  for (const { ticker, type } of positions) {
    if (type !== 'crypto' && type !== 'stock' && type !== 'etf') {
      pricesUSD.set(ticker, null)
      openPricesUSD.set(ticker, null)
    }
  }

  if (total === 0) {
    onDone(pricesUSD, openPricesUSD)
    return
  }

  // Pobierz FX — potrzebny do przeliczenia ETF-ów z EUR na USD.
  const fx = await fetchFxRates()

  // Pobierz krypto — wszystkie naraz (jeden request CoinGecko).
  const cryptoResult = await fetchCryptoPrices(cryptoTickers)
  for (const ticker of cryptoTickers) {
    const price = cryptoResult.prices.get(ticker.toUpperCase()) ?? null
    const open = cryptoResult.opens.get(ticker.toUpperCase()) ?? null
    pricesUSD.set(ticker, price)
    openPricesUSD.set(ticker, open)
    done++
    if (price !== null) succeeded++
    else failed++
    onProgress(done, total, succeeded, failed)
  }

  // Pobierz akcje i ETF-y równolegle, aktualizując postęp po każdym.
  const stockFetches = stockEtfTickers.map(async (ticker) => {
    const upper = ticker.toUpperCase()
    const etfSymbol = STOOQ_ETF_SYMBOLS[upper]
    let result = null
    let isEur = false

    if (etfSymbol) {
      result = await fetchStooqPrice(etfSymbol)
      isEur = true
    } else {
      result = await fetchStooqPrice(`${ticker.toLowerCase()}.us`)
    }

    let priceUSD = null
    let openUSD = null

    if (result !== null) {
      if (isEur && fx?.eurToUsd) {
        priceUSD = result.close * fx.eurToUsd
        openUSD = result.open !== null ? result.open * fx.eurToUsd : null
      } else if (!isEur) {
        priceUSD = result.close
        openUSD = result.open
      }
      // Jeśli isEur ale brak eurToUsd → priceUSD zostaje null
    }

    pricesUSD.set(ticker, priceUSD)
    openPricesUSD.set(ticker, openUSD)
    done++
    if (priceUSD !== null) succeeded++
    else failed++
    onProgress(done, total, succeeded, failed)
  })

  await Promise.all(stockFetches)
  onDone(pricesUSD, openPricesUSD)

  return fx
}
