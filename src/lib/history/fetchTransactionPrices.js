/**
 * Pobieranie dziennych świec historycznych do weryfikacji cen transakcji.
 *
 * Cel: dla każdej transakcji kupna/sprzedaży sprawdzamy, czy wpisana cena
 * mieści się w zakresie historycznych notowań z tamtego dnia (lub najbliższego
 * dostępnego dnia handlowego). Wynikiem jest kolorowa kropka przy każdej cenie:
 *   ● zielona — cena wygląda prawidłowo (mieści się w zakresie dnia ± bufor)
 *   ● czerwona — cena znacząco odbiega od notowań rynkowych
 *   ● szara  — brak danych (obligacje, gotówka, metale, błąd sieci, data poza zakresem)
 *
 * WAŻNA DECYZJA ARCHITEKTONICZNA — korekta o splity:
 *   Yahoo Finance zwraca ceny historyczne SKORYGOWANE o późniejsze splity akcji.
 *   Przykład: NVDA split 10:1 (2024-06-10). Transakcje sprzed splitu wpisane były
 *   po cenach ~230–680 USD. Yahoo dla tych dat zwraca ceny ~23–68 USD (po korekcie ÷10).
 *   Rozwiązanie: pobieramy listę splitów z pola events.splits w odpowiedzi Yahoo,
 *   a następnie dla każdej transakcji mnożymy skorygowaną cenę Yahoo przez łączny
 *   współczynnik splitów, które nastąpiły PO dacie transakcji. Daje to cenę „jak
 *   notowano tamtego dnia" — porównywalną z tym, co wpisał użytkownik.
 *
 * DECYZJA O WALUCIE PORÓWNANIA:
 *   Porównujemy w walucie notowania aktywa (meta.currency z Yahoo), nie w USD.
 *   - akcje USA i krypto: notowane w USD, transakcje w USD → porównanie wprost
 *   - europejskie ETF-y (VWCE.DE, EUNL.DE, SXR8.DE): notowane w EUR, transakcje
 *     w EUR → porównanie wprost w EUR (nie przeliczamy na USD, żeby uniknąć
 *     szumu kursowego i niespójności)
 *   Wyjątek: gdy waluta transakcji ≠ waluta notowania (obsłużone jako szara kropka,
 *   bo taki przypadek nie występuje w przykładowym pliku i jest skrajnie rzadki).
 *   To świadomy wyjątek od zasady walutowej projektu (obliczenia zawsze w USD)
 *   — dotyczy TYLKO weryfikacji danych wejściowych, nie obliczeń portfela.
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
  if (type === 'stock' || type === 'etf') return upper
  return null
}

/**
 * Przelicza datę ISO "YYYY-MM-DD HH:MM:SS" lub "YYYY-MM-DD" na unix timestamp (sekundy).
 */
function toUnix(dateStr) {
  return Math.floor(new Date(dateStr).getTime() / 1000)
}

/**
 * Pobiera dzienne świece z Yahoo Finance dla danego symbolu w zadanym oknie dat.
 * Dołącza też zdarzenia splitów (events=split), żeby móc cofnąć korektę.
 *
 * Zwraca obiekt:
 * {
 *   candles: [{ dateStr, low, high, close, unix }],  // posortowane rosnąco
 *   splits: [{ unix, ratio }],                        // ratio = numerator/denominator
 *   currency: string|null,                            // waluta notowania wg Yahoo
 * }
 * lub null gdy zapytanie się nie powiodło.
 */
async function fetchDailyCandles(symbol, fromUnix, toUnix_) {
  try {
    const url =
      `/api/yahoo/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?period1=${fromUnix}&period2=${toUnix_}&interval=1d&events=split`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const result = data?.chart?.result?.[0]
    if (!result) return null

    const currency = result.meta?.currency ?? null
    const timestamps = result.timestamp
    const quote = result.indicators?.quote?.[0]
    if (!Array.isArray(timestamps) || !quote) return null

    const lows = quote.low ?? []
    const highs = quote.high ?? []
    const closes = quote.close ?? []

    const candles = []
    for (let i = 0; i < timestamps.length; i++) {
      const low = lows[i]
      const high = highs[i]
      const close = closes[i]
      if (
        typeof low !== 'number' ||
        typeof high !== 'number' ||
        typeof close !== 'number' ||
        low <= 0 || high <= 0 || close <= 0
      ) {
        continue
      }
      const dateStr = new Date(timestamps[i] * 1000).toISOString().slice(0, 10)
      candles.push({ dateStr, low, high, close, unix: timestamps[i] })
    }

    // Splity z odpowiedzi Yahoo (mogą nie istnieć gdy w danym oknie nie było splitów)
    const splitsRaw = result.events?.splits ?? {}
    const splits = Object.values(splitsRaw).map((s) => ({
      unix: s.date,
      ratio: s.numerator / s.denominator,
    }))

    return { candles, splits, currency }
  } catch {
    return null
  }
}

/**
 * Oblicza łączny współczynnik korygujący dla ceny z danej daty transakcji.
 * Mnożymy przez iloczyn ratio wszystkich splitów, które nastąpiły PO dacie transakcji.
 *
 * Dzięki temu: cena_użytkownika ≈ cena_Yahoo_skorygowana × splitFactor
 * (cena jak notowano tamtego dnia, przed późniejszymi korekcjami)
 */
function splitFactor(transactionUnix, splits) {
  let factor = 1
  for (const s of splits) {
    if (s.unix > transactionUnix) {
      factor *= s.ratio
    }
  }
  return factor
}

/**
 * Dla danej daty transakcji (ISO string) znajdź najbliższą dostępną świecę.
 * Tolerancja: ±5 dni (weekendy, święta). Preferuje dzień ≤ dacie transakcji,
 * a jeśli nie ma → dzień > dacie transakcji (sesja po weekendzie).
 */
function findNearestCandle(dateStr, candles) {
  const targetDate = dateStr.slice(0, 10)
  const TOLERANCE_DAYS = 5
  const targetMs = new Date(targetDate).getTime()

  let best = null
  let bestDiff = Infinity

  for (const candle of candles) {
    const diff = Math.abs(new Date(candle.dateStr).getTime() - targetMs)
    const diffDays = diff / (1000 * 60 * 60 * 24)
    if (diffDays <= TOLERANCE_DAYS && diffDays < bestDiff) {
      best = candle
      bestDiff = diffDays
    }
  }

  return best
}

/**
 * Próg tolerancji dla weryfikacji ceny.
 *
 * Strategia dwustopniowa:
 *   1. Jeśli cena mieści się w zakresie [low, high] danego dnia → ZIELONA (realna cena śróddzienna).
 *   2. Jeśli poza zakresem — liczymy odchylenie względem najbliższej granicy:
 *      odchylenie = |cena - granica| / granica
 *      Jeśli odchylenie ≤ BUFFER → ZIELONA (prowizja, zaokrąglenie, sąsiedni dzień).
 *      Jeśli > BUFFER → CZERWONA (podejrzana pomyłka).
 *
 * BUFFER = 15%: absorbuje zaokrąglenia, prowizje wliczone w cenę, dopasowanie
 * do sąsiedniego dnia notowań. Wybrany empirycznie tak, żeby na przykładowym pliku
 * nie było fałszywych alarmów przy cenach historycznych (po korekcie splitów NVDA).
 */
const PRICE_BUFFER = 0.15

/**
 * Weryfikuje pojedynczą cenę transakcji względem świecy dziennej.
 *
 * @param {number} txPrice - cena wpisana przez użytkownika (w walucie transakcji)
 * @param {object} candle - { low, high, close } — ceny Yahoo PRZED korektą splitów
 *                          (czyli już pomnożone przez splitFactor)
 * @returns {'green'|'red'|'gray'}
 */
function verifyPrice(txPrice, candle) {
  if (!candle) return 'gray'

  const { low, high } = candle

  // Krok 1: czy mieści się w zakresie śróddziennym?
  if (txPrice >= low && txPrice <= high) return 'green'

  // Krok 2: odchylenie od najbliższej granicy
  const nearestBound = txPrice < low ? low : high
  const deviation = Math.abs(txPrice - nearestBound) / nearestBound
  if (deviation <= PRICE_BUFFER) return 'green'

  return 'red'
}

/**
 * Główna funkcja weryfikacji cen transakcji dla jednego aktywa.
 *
 * Parametry:
 *   ticker  : symbol giełdowy
 *   type    : 'stock'|'etf'|'crypto'|'bond'|'cash'|'precious_metal'
 *   txList  : lista transakcji dla tego tickera (wszystkie akcje: buy/sell/dividend)
 *
 * Zwraca: Map<transactionIndex, 'green'|'red'|'gray'>
 *   Klucz to indeks transakcji w txList (0-based).
 *   Dywidendy zawsze 'gray' (weryfikujemy tylko kupno i sprzedaż).
 *   Aktywa bez ceny rynkowej → wszystkie 'gray'.
 */
export async function fetchAndVerifyPrices(ticker, type, txList) {
  const result = new Map()

  // Inicjalizacja — domyślnie szara kropka (brak danych)
  for (let i = 0; i < txList.length; i++) {
    result.set(i, 'gray')
  }

  const symbol = yahooSymbol(ticker, type)
  if (!symbol) {
    // obligacje, gotówka, metale — brak historii cen rynkowych
    return result
  }

  // Zbierz tylko transakcje buy/sell (dywidendy nie weryfikujemy)
  const buysSells = txList
    .map((tx, i) => ({ tx, i }))
    .filter(({ tx }) => tx.action === 'buy' || tx.action === 'sell')

  if (buysSells.length === 0) return result

  // Wyznacz zakres dat: od najwcześniejszej transakcji −5 dni AŻ DO DZIŚ.
  //
  // Dlaczego do dziś, a nie do ostatniej transakcji: Yahoo zwraca zdarzenia splitów
  // (events=split) WYŁĄCZNIE z okresu zapytania. Split może nastąpić PO ostatniej
  // transakcji (np. NVDA 10:1 z 2024-06-10), a wpływa na korektę cen WSZYSTKICH
  // wcześniejszych transakcji tego aktywa. Gdyby okno kończyło się na ostatniej
  // transakcji, nie zobaczylibyśmy takiego splitu, nie cofnęlibyśmy korekty Yahoo
  // i pokazalibyśmy fałszywą czerwoną kropkę przy poprawnej cenie.
  // Dodatkowe świece (do dziś) są nieszkodliwe — findNearestCandle i tak dopasowuje
  // tylko świece z pobliża daty każdej transakcji.
  const dates = buysSells.map(({ tx }) => toUnix(tx.date))
  const minUnix = Math.min(...dates) - 5 * 24 * 3600
  const maxUnix = Math.floor(Date.now() / 1000)

  const data = await fetchDailyCandles(symbol, minUnix, maxUnix)
  if (!data) return result

  const { candles, splits, currency: yahooCurrency } = data

  // Weryfikuj każde kupno/sprzedaż
  for (const { tx, i } of buysSells) {
    // Sprawdzamy zgodność waluty: porównujemy w walucie notowania Yahoo.
    // Jeśli waluta transakcji ≠ waluta notowania → szara kropka (nie zgadujemy przelicznika).
    // (W przykładowym pliku akcje USD → Yahoo USD, ETF-y EUR → Yahoo EUR — zawsze pasuje.)
    if (tx.currency !== yahooCurrency) {
      result.set(i, 'gray')
      continue
    }

    const txUnix = toUnix(tx.date)
    const factor = splitFactor(txUnix, splits)
    const txDateStr = tx.date.slice(0, 10)
    const nearestCandle = findNearestCandle(txDateStr, candles)

    if (!nearestCandle) {
      result.set(i, 'gray')
      continue
    }

    // Korygujemy świecę o splity: mnożymy przez factor, żeby otrzymać
    // cenę "jak notowano tamtego dnia" (nieskorygowaną o późniejsze splity).
    const correctedCandle = {
      low: nearestCandle.low * factor,
      high: nearestCandle.high * factor,
      close: nearestCandle.close * factor,
    }

    result.set(i, verifyPrice(tx.price, correctedCandle))
  }

  return result
}
