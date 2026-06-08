/**
 * Agregacja transakcji w portfel pogrupowany po brokerze i tickerze.
 *
 * Zasada walutowa: wszystkie obliczenia prowadzimy w USD.
 * Na PLN przeliczamy tylko przy wyświetlaniu (w komponentach).
 *
 * Definicje finansowe użyte w tym module:
 *
 *  heldQty — ilość aktywów, którą aktualnie posiadasz po uwzględnieniu sprzedaży
 *             (zakupy − sprzedaże). Jeśli ≤ prawie zera → pozycja jest zamknięta.
 *
 *  costBasisUSD — ile łącznie zapłaciłeś za posiadane jednostki (w USD).
 *                 Liczymy: avgCostUSD × heldQty, gdzie avgCostUSD to średnia
 *                 cena zakupu jednej jednostki (Σkoszt_zakupów_USD / Σilość_zakupów).
 *
 *  pnlUSD — zysk lub strata (Profit & Loss) w USD = wartość dziś − koszt zakupu.
 *           Wartość dodatnia = zysk, ujemna = strata.
 *           Nazywamy to "niezrealizowanym" zyskiem, bo aktywo wciąż masz.
 *
 *  holdingDays — ile pełnych dni mija od pierwszego zakupu tego tickera u tego
 *                brokera do dziś.
 */

const EPSILON = 1e-9 // próg poniżej którego traktujemy ilość jako zero

/**
 * Przelicza cenę z waluty transakcji na USD.
 * Jeśli waluta to już USD → bez przeliczenia.
 * Jeśli EUR → mnoży przez eurToUsd.
 * Jeśli PLN → dzieli przez usdToPln.
 * Jeśli waluta nieznana lub kurs niedostępny → zwraca null.
 */
function toUSD(amount, currency, fx) {
  if (currency === 'USD') return amount
  if (currency === 'EUR') {
    if (!fx?.eurToUsd) return null
    return amount * fx.eurToUsd
  }
  if (currency === 'PLN') {
    if (!fx?.usdToPln) return null
    return amount / fx.usdToPln
  }
  return null
}

/**
 * Zlicza pełne dni między datą a dniem dzisiejszym.
 */
function daysSince(dateString, today) {
  const d = new Date(dateString)
  const t = new Date(today)
  // Zerujemy godziny, żeby liczyć pełne doby
  d.setHours(0, 0, 0, 0)
  t.setHours(0, 0, 0, 0)
  return Math.floor((t - d) / (1000 * 60 * 60 * 24))
}

/**
 * Buduje portfel z listy transakcji.
 *
 * Parametry:
 *   transactions — lista transakcji z parseTransactions
 *   fx — { usdToPln, eurToUsd } z Frankfurter (może być null)
 *   pricesUSD — Map<ticker, number|null> z fetchAllPrices (może być null/pusta)
 *   openPricesUSD — Map<ticker, number|null> ceny otwarcia dnia w USD (może być null/pusta)
 *   today — string 'YYYY-MM-DD', domyślnie bieżąca data
 *
 * Zwraca tablicę brokerów:
 *   [{
 *     broker: string,
 *     positions: [{
 *       ticker, name, type,
 *       heldQty,
 *       avgCostUSD,
 *       costBasisUSD,
 *       minPricePaid: { price, currency },
 *       maxPricePaid: { price, currency },
 *       holdingDays,
 *       currentPriceUSD,   // null = brak ceny
 *       currentValueUSD,   // null = brak ceny
 *       pnlUSD,            // null = brak ceny
 *       pnlPct,            // null = brak ceny lub koszt=0
 *       portfolioSharePct, // null = brak ceny
 *       dayChangeUSD,      // null = brak ceny otwarcia
 *     }],
 *     totalValueUSD,       // suma pozycji z ceną
 *     totalPnlUSD,         // suma pnl pozycji z ceną
 *   }]
 *
 *  + pola na poziomie całego portfela:
 *    totalPortfolioValueUSD — suma currentValueUSD wszystkich pozycji z ceną
 *    totalInvestedUSD       — suma costBasisUSD pozycji z ceną (obligacje/cash wykluczone)
 *    totalPnlUSD            — suma pnlUSD pozycji z ceną
 *    totalDayChangeUSD      — zmiana wartości portfela dzisiaj (null gdy brak otwartych cen)
 *    cagrPct                — średnioroczny wzrost w % (null gdy za mało danych)
 *
 * UWAGA: obligacje (bond) i gotówka (cash) nie mają ceny rynkowej — są wykluczone ze
 * wszystkich sum panelu podsumowania. Wycenę obligacji (naliczone odsetki) dodamy
 * w przyszłości po stronie aplikacji.
 */
export function buildPortfolio(transactions, fx, pricesUSD, openPricesUSD, today) {
  const todayStr = today ?? new Date().toISOString().slice(0, 10)

  // Grupowanie transakcji: broker → ticker → lista transakcji
  const byBrokerTicker = new Map()

  for (const t of transactions) {
    if (t.action === 'dividend') continue // dywidendy obsłużymy osobno

    const brokerKey = t.broker || '(nieznany broker)'
    if (!byBrokerTicker.has(brokerKey)) byBrokerTicker.set(brokerKey, new Map())
    const byTicker = byBrokerTicker.get(brokerKey)

    if (!byTicker.has(t.ticker)) byTicker.set(t.ticker, [])
    byTicker.get(t.ticker).push(t)
  }

  // Obliczenie łącznej wartości portfela (do udziałów procentowych)
  // — zrobimy to po policzeniu wszystkich pozycji
  const allPositions = []

  const brokers = []

  for (const [broker, byTicker] of byBrokerTicker) {
    const positions = []

    for (const [ticker, txs] of byTicker) {
      const buys = txs.filter((t) => t.action === 'buy')
      const sells = txs.filter((t) => t.action === 'sell')

      if (buys.length === 0) continue

      // heldQty = Σbuy.quantity − Σsell.quantity
      const totalBought = buys.reduce((s, t) => s + t.quantity, 0)
      const totalSold = sells.reduce((s, t) => s + t.quantity, 0)
      const heldQty = totalBought - totalSold

      if (heldQty <= EPSILON) continue // pozycja zamknięta — pomijamy

      // Średni koszt zakupu w USD (Σ koszt_USD / Σ ilość)
      let totalCostUSD = 0
      let totalQtyForAvg = 0
      for (const t of buys) {
        const unitCostUSD = toUSD(t.price, t.currency, fx)
        if (unitCostUSD !== null) {
          totalCostUSD += unitCostUSD * t.quantity
          totalQtyForAvg += t.quantity
        }
      }
      const avgCostUSD = totalQtyForAvg > 0 ? totalCostUSD / totalQtyForAvg : null
      const costBasisUSD = avgCostUSD !== null ? avgCostUSD * heldQty : null

      // Min/max cena zakupu w walucie natywnej
      const name = buys[0].name
      const type = buys[0].type
      const nativeCurrency = buys[0].currency
      const buyPrices = buys.map((t) => t.price)
      const minPricePaid = { price: Math.min(...buyPrices), currency: nativeCurrency }
      const maxPricePaid = { price: Math.max(...buyPrices), currency: nativeCurrency }

      // Czas trzymania: od najwcześniejszego zakupu do dziś
      const earliestBuyDate = buys
        .map((t) => t.date)
        .sort()[0]
      const holdingDays = daysSince(earliestBuyDate, todayStr)

      // Aktualna cena i wartość
      const currentPriceUSD = pricesUSD?.get(ticker) ?? null
      const currentValueUSD =
        currentPriceUSD !== null ? currentPriceUSD * heldQty : null

      // Zysk/strata (P&L)
      const pnlUSD =
        currentValueUSD !== null && costBasisUSD !== null
          ? currentValueUSD - costBasisUSD
          : null
      const pnlPct =
        pnlUSD !== null && costBasisUSD && costBasisUSD > 0
          ? (pnlUSD / costBasisUSD) * 100
          : null

      // Zmiana dzienna: (cena dziś − cena otwarcia) × ilość posiadanych jednostek
      // Cena otwarcia pochodzi z Yahoo Finance (Open dziennej świecy).
      const openPriceUSD = openPricesUSD?.get(ticker) ?? null
      const dayChangeUSD =
        currentPriceUSD !== null && openPriceUSD !== null
          ? (currentPriceUSD - openPriceUSD) * heldQty
          : null

      const position = {
        ticker,
        name,
        type,
        heldQty,
        avgCostUSD,
        costBasisUSD,
        minPricePaid,
        maxPricePaid,
        holdingDays,
        earliestBuyDate, // potrzebne do CAGR
        currentPriceUSD,
        currentValueUSD,
        pnlUSD,
        pnlPct,
        dayChangeUSD,
        portfolioSharePct: null, // uzupełnimy po zsumowaniu całego portfela
      }

      positions.push(position)
      allPositions.push(position)
    }

    if (positions.length === 0) continue

    const totalValueUSD = positions
      .filter((p) => p.currentValueUSD !== null)
      .reduce((s, p) => s + p.currentValueUSD, 0)

    const totalPnlUSD = positions
      .filter((p) => p.pnlUSD !== null)
      .reduce((s, p) => s + p.pnlUSD, 0)

    brokers.push({ broker, positions, totalValueUSD, totalPnlUSD })
  }

  // Łączna wartość całego portfela (suma pozycji z ceną, po wszystkich brokerach)
  // Jest to ta sama liczba, którą wyświetla panel podsumowania jako "Łączna wartość".
  const totalPortfolioValueUSD = allPositions
    .filter((p) => p.currentValueUSD !== null)
    .reduce((s, p) => s + p.currentValueUSD, 0)

  // Uzupełnienie udziałów procentowych
  for (const position of allPositions) {
    if (position.currentValueUSD !== null && totalPortfolioValueUSD > 0) {
      position.portfolioSharePct = (position.currentValueUSD / totalPortfolioValueUSD) * 100
    }
  }

  // ─── Sumy panelu podsumowania (tylko pozycje z ceną) ─────────────────────────
  // Obligacje i gotówka nie mają ceny rynkowej → są wykluczone.
  // Dzięki temu zachodzi: wartość − zainwestowane = zysk/strata.

  const positionsWithPrice = allPositions.filter((p) => p.currentValueUSD !== null)

  // Łączna kwota zainwestowana w posiadane pozycje (w USD)
  const totalInvestedUSD = positionsWithPrice.reduce(
    (s, p) => s + (p.costBasisUSD ?? 0),
    0,
  )

  // Łączny zysk/strata portfela (suma po brokerach = suma pnlUSD pozycji z ceną)
  const totalPnlUSD = positionsWithPrice.reduce(
    (s, p) => s + (p.pnlUSD ?? 0),
    0,
  )

  // Zmiana wartości portfela dzisiaj (null jeśli żadna pozycja nie ma ceny otwarcia)
  const positionsWithDayChange = positionsWithPrice.filter((p) => p.dayChangeUSD !== null)
  const totalDayChangeUSD =
    positionsWithDayChange.length > 0
      ? positionsWithDayChange.reduce((s, p) => s + p.dayChangeUSD, 0)
      : null

  // CAGR: (wartość_dziś / zainwestowane)^(1/lata) − 1
  // lata = (dziś − najwcześniejsza data zakupu w portfelu) / 365.25
  // Liczone tylko po pozycjach z ceną.
  let cagrPct = null
  if (positionsWithPrice.length > 0 && totalInvestedUSD > 0) {
    const earliestDate = positionsWithPrice
      .map((p) => p.earliestBuyDate)
      .filter(Boolean)
      .sort()[0]
    if (earliestDate) {
      const years = daysSince(earliestDate, todayStr) / 365.25
      if (years >= 0.1) {
        cagrPct = (Math.pow(totalPortfolioValueUSD / totalInvestedUSD, 1 / years) - 1) * 100
      }
    }
  }

  return {
    brokers,
    totalPortfolioValueUSD,
    totalInvestedUSD,
    totalPnlUSD,
    totalDayChangeUSD,
    cagrPct,
  }
}
