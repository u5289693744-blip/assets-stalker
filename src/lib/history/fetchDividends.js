/**
 * Pobieranie historii dywidend z Yahoo Finance przez proxy /api/yahoo.
 *
 * Dywidenda na akcję (amount) × heldQty w dniu ex-dividend = dywidenda otrzymana.
 * Przeliczenie na USD: dywidendy Yahoo są podane w walucie waloru
 * (np. USD dla akcji US, EUR dla ETF-ów .de). Używamy bieżącego FX.
 *
 * Krypto, obligacje, gotówka — pomijamy (brak dywidend).
 */

/**
 * Pobiera historię dywidend dla jednego tickera z Yahoo Finance.
 * Zwraca tablicę { dateStr: "YYYY-MM-DD", amount: number } lub [] gdy się nie uda.
 *
 * Parametr yahooSymbol: np. "AAPL" (akcje US) lub "VWCE.DE" (ETF europejski).
 */
async function fetchYahooDividends(yahooSymbol) {
  try {
    const url = `/api/yahoo/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?period1=0&period2=9999999999&interval=1d&events=div`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    const divObj = data?.chart?.result?.[0]?.events?.dividends
    if (!divObj || typeof divObj !== 'object') return []

    const list = []
    for (const entry of Object.values(divObj)) {
      const amount = entry?.amount
      const ts = entry?.date
      if (typeof amount !== 'number' || typeof ts !== 'number') continue
      const dateStr = new Date(ts * 1000).toISOString().slice(0, 10)
      list.push({ dateStr, amount })
    }
    list.sort((a, b) => a.dateStr.localeCompare(b.dateStr))
    return list
  } catch {
    return []
  }
}

/**
 * Mapuje ticker na symbol Yahoo Finance.
 * Akcje US: ticker bezpośrednio (AAPL, MSFT, ...).
 * ETF-y europejskie: próbujemy <TICKER>.DE (np. VWCE.DE).
 */
function toYahooSymbol(ticker, type) {
  const upper = ticker.toUpperCase()
  const ETF_DE = { VWCE: 'VWCE.DE', EUNL: 'EUNL.DE', SXR8: 'SXR8.DE' }
  if (type === 'etf' && ETF_DE[upper]) return { symbol: ETF_DE[upper], isEur: true }
  if (type === 'stock') return { symbol: upper, isEur: false }
  return null
}

/**
 * Oblicza heldQty na dany dzień (z transakcji buy/sell tego tickera do podanej daty).
 */
function heldQtyAtDate(transactions, ticker, dateStr) {
  let qty = 0
  for (const t of transactions) {
    if (t.ticker !== ticker) continue
    if (t.action !== 'buy' && t.action !== 'sell') continue
    if (t.date.slice(0, 10) > dateStr) continue
    if (t.action === 'buy') qty += t.quantity
    else qty -= t.quantity
  }
  return qty
}

/**
 * Główna funkcja — pobiera dywidendy dla całego portfela i grupuje po roku.
 *
 * Parametry:
 *   positions: [{ ticker, type }]
 *   transactions: lista wszystkich transakcji
 *   fx: { usdToPln, eurToUsd }
 *
 * Zwraca tablicę punktów rocznych do wykresu słupkowego:
 * [
 *   {
 *     year: "2023",
 *     totalUSD: number,           // suma dywidend w USD w tym roku
 *     byTicker: { AAPL: usd, ...} // podział na tickery (w USD)
 *   },
 *   ...
 * ]
 * Posortowane rosnąco po roku.
 */
export async function fetchAllDividends(positions, transactions, fx) {
  const buySellTxs = transactions.filter((t) => t.action === 'buy' || t.action === 'sell')

  // Zbieramy unikalne stock/etf tickery
  const toFetch = []
  const seen = new Set()
  for (const { ticker, type } of positions) {
    if (seen.has(ticker)) continue
    seen.add(ticker)
    if (type !== 'stock' && type !== 'etf') continue
    const mapped = toYahooSymbol(ticker, type)
    if (mapped) toFetch.push({ ticker, type, ...mapped })
  }

  // Pobieramy dywidendy równolegle
  const fetched = await Promise.all(
    toFetch.map(async ({ ticker, symbol, isEur }) => {
      const divs = await fetchYahooDividends(symbol)
      return { ticker, isEur, divs }
    }),
  )

  // Grupowanie po roku i tickerze (w USD)
  const yearMap = new Map() // "YYYY" → Map<ticker, totalUSD>

  for (const { ticker, isEur, divs } of fetched) {
    for (const { dateStr, amount } of divs) {
      // Ile akcji mieliśmy w dniu wypłaty dywidendy?
      const qty = heldQtyAtDate(buySellTxs, ticker, dateStr)
      if (qty <= 1e-9) continue // nie posiadaliśmy akcji w tym dniu

      // Kwota dywidendy w USD
      let amountUSD
      if (isEur) {
        amountUSD = fx?.eurToUsd ? amount * qty * fx.eurToUsd : null
      } else {
        amountUSD = amount * qty
      }
      if (amountUSD === null || amountUSD <= 0) continue

      const year = dateStr.slice(0, 4)
      if (!yearMap.has(year)) yearMap.set(year, new Map())
      const byTicker = yearMap.get(year)
      byTicker.set(ticker, (byTicker.get(ticker) ?? 0) + amountUSD)
    }
  }

  // Konwertuj do tablicy posortowanej po roku
  const result = []
  for (const [year, byTicker] of yearMap) {
    let totalUSD = 0
    const byTickerObj = {}
    for (const [ticker, usd] of byTicker) {
      totalUSD += usd
      byTickerObj[ticker] = usd
    }
    result.push({ year, totalUSD, byTicker: byTickerObj })
  }
  result.sort((a, b) => a.year.localeCompare(b.year))

  return result
}
