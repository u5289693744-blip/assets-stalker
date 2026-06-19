/**
 * Rekonstrukcja portfela w czasie — do wykresów historycznych.
 *
 * Dla każdego miesiąca od pierwszej transakcji do dziś obliczamy:
 *  - ile jednostek każdego tickera było posiadanych (heldQty)
 *  - po jakiej średniej cenie zakupu (avgCostUSD)
 *  - ile wynosiła wartość rynkowa (valueUSD) i zainwestowane (investedUSD)
 *
 * Zasada walutowa: wszystkie kwoty w USD (przeliczenie EUR/PLN bieżącym kursem FX,
 * identycznie jak buildPortfolio). Na PLN przeliczamy tylko w komponentach.
 *
 * WAŻNA SPÓJNOŚĆ:
 * Ostatni punkt na osi (bieżący miesiąc) jest pinowany do wyników buildPortfolio —
 * używamy currentValueUSD i costBasisUSD z pozycji portfela, a nie cen historycznych.
 * Dzięki temu suma wykresu zawsze równa się totalPortfolioValueUSD z panelu.
 */

/**
 * Przelicza cenę na USD (ta sama logika co toUSD w buildPortfolio).
 */
function toUSD(amount, currency, fx) {
  if (currency === 'USD') return amount
  if (currency === 'EUR') return fx?.eurToUsd ? amount * fx.eurToUsd : null
  if (currency === 'PLN') return fx?.usdToPln ? amount / fx.usdToPln : null
  return null
}

// Typy aktywów z ceną (wyceniane). Polskie obligacje detaliczne mają estymowaną cenę
// (naliczone odsetki) → wchodzą do sum. Gotówkę i metale szlachetne wykluczamy.
// UWAGA: obligacje mają cenę tylko w bieżącym miesiącu (pinowanie z buildPortfolio);
// w miesiącach historycznych nie mamy historycznych cen obligacji → wartość = 0.
const PRICEABLE_TYPES = new Set(['stock', 'etf', 'crypto', 'bond'])

/**
 * Generuje listę miesięcy od startMonthKey do endMonthKey (włącznie).
 * Format klucza: "YYYY-MM".
 */
function generateMonths(startKey, endKey) {
  const months = []
  let [y, m] = startKey.split('-').map(Number)
  const [ey, em] = endKey.split('-').map(Number)
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return months
}

/**
 * Zwraca ostatni dzień miesiąca jako obiekt Date.
 * Np. "2024-03" → 2024-03-31T23:59:59
 */
function endOfMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number)
  // Dzień 0 następnego miesiąca = ostatni dzień bieżącego miesiąca
  return new Date(Date.UTC(y, m, 0, 23, 59, 59))
}

/**
 * Główna funkcja rekonstrukcji.
 *
 * Parametry:
 *   transactions: lista transakcji (z parseTransactions)
 *   fx: { usdToPln, eurToUsd }
 *   historicalPrices: Map<ticker, Map<"YYYY-MM-DD", priceUSD>>  (z fetchAllHistoricalPrices)
 *   portfolio: wynik buildPortfolio (do pinowania punktu "dziś")
 *   todayStr: "YYYY-MM-DD"
 *
 * Zwraca tablicę punktów miesięcznych:
 * [
 *   {
 *     monthKey: "YYYY-MM",
 *     label: "03.2024",           // do wyświetlania na osi
 *     totalValueUSD: number,      // suma wartości rynkowej posiadanych pozycji (z ceną)
 *     totalInvestedUSD: number,   // suma zainwestowanych w posiadane pozycje
 *     byType: {                   // podział według typu aktywa
 *       stock: number,
 *       etf: number,
 *       crypto: number,
 *       bond: number,
 *       cash: number,
 *       precious_metal: number,
 *     },
 *   },
 *   ...
 * ]
 */
export function buildPortfolioHistory(transactions, fx, historicalPrices, portfolio, todayStr) {
  // Filtrujemy dywidendy — do historii wartości portfela nie są potrzebne.
  const buySellTxs = transactions.filter((t) => t.action === 'buy' || t.action === 'sell')

  if (buySellTxs.length === 0) return []

  // Znajdź najwcześniejszą datę transakcji
  const allDates = buySellTxs.map((t) => t.date).sort()
  const firstMonthKey = allDates[0].slice(0, 7)
  const todayMonthKey = todayStr.slice(0, 7)

  const months = generateMonths(firstMonthKey, todayMonthKey)

  // Unikalne tickery z ich typem (bierzemy typ z pierwszej transakcji buy)
  const tickerTypeMap = new Map()
  for (const t of buySellTxs) {
    if (!tickerTypeMap.has(t.ticker)) {
      tickerTypeMap.set(t.ticker, t.type)
    }
  }

  // Mapa: ticker → bieżąca pozycja z portfolio (do pinowania punktu "dziś")
  const currentPositions = new Map()
  if (portfolio) {
    for (const broker of portfolio.brokers) {
      for (const pos of broker.positions) {
        // Jeśli ten sam ticker u kilku brokerów — agregujemy
        if (currentPositions.has(pos.ticker)) {
          const existing = currentPositions.get(pos.ticker)
          existing.currentValueUSD =
            existing.currentValueUSD !== null && pos.currentValueUSD !== null
              ? existing.currentValueUSD + pos.currentValueUSD
              : null
          existing.costBasisUSD += pos.costBasisUSD ?? 0
          existing.heldQty += pos.heldQty
        } else {
          currentPositions.set(pos.ticker, {
            ticker: pos.ticker,
            type: pos.type,
            currentValueUSD: pos.currentValueUSD,
            costBasisUSD: pos.costBasisUSD ?? 0,
            heldQty: pos.heldQty,
            avgCostUSD: pos.avgCostUSD,
          })
        }
      }
    }
  }

  const result = []

  for (const monthKey of months) {
    const isCurrentMonth = monthKey === todayMonthKey
    const endDate = isCurrentMonth ? new Date(todayStr + 'T23:59:59Z') : endOfMonth(monthKey)

    const typeValues = {
      stock: 0,
      etf: 0,
      crypto: 0,
      bond: 0,
      cash: 0,
      precious_metal: 0,
    }
    let totalValueUSD = 0
    let totalInvestedUSD = 0

    for (const [ticker, type] of tickerTypeMap) {
      // heldQty na koniec tego miesiąca
      const txsUntilEnd = buySellTxs.filter(
        (t) => t.ticker === ticker && t.date.slice(0, 10) <= endDate.toISOString().slice(0, 10),
      )

      const totalBought = txsUntilEnd
        .filter((t) => t.action === 'buy')
        .reduce((s, t) => s + t.quantity, 0)
      const totalSold = txsUntilEnd
        .filter((t) => t.action === 'sell')
        .reduce((s, t) => s + t.quantity, 0)
      const heldQty = totalBought - totalSold

      if (heldQty <= 1e-9) continue // nie posiadamy tego aktywa w tym miesiącu

      // Średni koszt zakupu USD do tego momentu
      const buyTxsUntilEnd = txsUntilEnd.filter((t) => t.action === 'buy')
      let totalCostUSD = 0
      let totalQtyForAvg = 0
      for (const t of buyTxsUntilEnd) {
        const unitUSD = toUSD(t.price, t.currency, fx)
        if (unitUSD !== null) {
          totalCostUSD += unitUSD * t.quantity
          totalQtyForAvg += t.quantity
        }
      }
      const avgCostUSD = totalQtyForAvg > 0 ? totalCostUSD / totalQtyForAvg : null
      const investedUSD = avgCostUSD !== null ? avgCostUSD * heldQty : 0

      // ─── Wartość rynkowa i zainwestowane ──────────────────────────────────
      // Spójność z panelem:
      //  • obligacje/gotówka (brak ceny) są wykluczone z OBU sum (wartość i zainwestowane),
      //  • bieżący miesiąc pinujemy do buildPortfolio (wartość = currentValueUSD,
      //    zainwestowane = costBasisUSD), więc ostatni punkt = liczby z panelu co do grosza.
      let valueUSD = null
      let investedTickerUSD = 0

      if (isCurrentMonth) {
        const cur = currentPositions.get(ticker)
        if (cur && cur.currentValueUSD !== null) {
          // Wartość i koszt zagregowane z pozycji panelu (kilku brokerów dla tickera
          // sumujemy razem) — gwarantuje zgodność z totalPortfolioValueUSD i totalInvestedUSD.
          valueUSD = cur.currentValueUSD
          investedTickerUSD = cur.costBasisUSD
        }
        // brak ceny (obligacje, gotówka) → poza sumami, dokładnie tak jak w panelu
      } else if (PRICEABLE_TYPES.has(type)) {
        // Miesiące historyczne — tylko aktywa z ceną rynkową.
        investedTickerUSD = investedUSD
        const dailyMap = historicalPrices?.get(ticker)
        if (dailyMap && dailyMap.size > 0) {
          const histPrice = getPriceAtMonthEnd(dailyMap, endDate)
          valueUSD = histPrice !== null ? histPrice * heldQty : null
        }
      }

      totalInvestedUSD += investedTickerUSD

      if (valueUSD !== null) {
        totalValueUSD += valueUSD
        const typeKey = type in typeValues ? type : 'stock'
        typeValues[typeKey] += valueUSD
      }
    }

    const [yy, mm] = monthKey.split('-')
    result.push({
      monthKey,
      label: `${mm}.${yy}`,
      totalValueUSD,
      totalInvestedUSD,
      byType: { ...typeValues },
    })
  }

  return result
}

/**
 * Ze słownika dziennego (Map<"YYYY-MM-DD", price>) wyciąga cenę na koniec danego dnia.
 * Pomocnicza — wyeksportowana do użycia w innych modułach.
 */
export function getPriceAtMonthEnd(dailyMap, endDate) {
  if (!dailyMap || dailyMap.size === 0) return null
  const endStr = endDate.toISOString().slice(0, 10)
  let best = null
  let bestDate = null
  for (const [dateStr, price] of dailyMap) {
    if (dateStr <= endStr) {
      if (bestDate === null || dateStr > bestDate) {
        bestDate = dateStr
        best = price
      }
    }
  }
  return best
}
