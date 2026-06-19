/**
 * Estymator wartości polskich detalicznych obligacji skarbowych.
 *
 * Polskie obligacje skarbowe (EDO, COI, TOS, DOS, ROS) to papiery wartościowe
 * sprzedawane osobom fizycznym przez Ministerstwo Finansów. Nie są notowane na
 * giełdzie — ich wartość wynika z naliczonych odsetek według zasad emisji.
 *
 * Ten moduł rozpoznaje obligacje po kodzie tickera (np. EDO1035, COI1027)
 * i estymuje ich bieżącą wartość na podstawie:
 *  - zasad naliczania odsetek danego typu (stałe vs indeksowane inflacją)
 *  - stóp procentowych z tabeli emisji
 *  - rocznych wskaźników inflacji z GUS (dla typów indeksowanych)
 *
 * WAŻNE: to jest estymata, nie oficjalna wycena. Służy do przybliżonego pokazania
 * wartości obligacji w portfelu. Rzeczywista wartość może się nieznacznie różnić
 * (np. przez dokładne daty naliczania, prowizje za wcześniejszy wykup itp.).
 *
 * Zasada walutowa projektu: ten moduł zwraca wartość w PLN.
 * Przeliczenie na USD odbywa się w fetchPrices.js (dzielenie przez kurs usdToPln).
 */

// ─── Wzorzec tickera polskich obligacji detalicznych ───────────────────────────
// Format: PREFIKS + 4 cyfry (MMYY), np. EDO1035 = wykup w październiku 2035
const POLISH_BOND_REGEX = /^(EDO|COI|ROS|DOS|TOS)(\d{4})$/

/**
 * Sprawdza, czy ticker pasuje do wzorca polskiej obligacji detalicznej.
 * Zwraca true/false.
 */
export function isPolishRetailBond(ticker) {
  return POLISH_BOND_REGEX.test(ticker?.toUpperCase?.() ?? '')
}

// ─── Definicje typów obligacji ─────────────────────────────────────────────────
// Każdy typ ma:
//   years       — długość obligacji w latach
//   indexed     — czy oprocentowanie zależy od inflacji (po 1. roku)
//   margin      — marża ponad inflację (dla typów indeksowanych, w ułamku dziesiętnym)
//   capitalizes — czy odsetki są kapitalizowane (doliczane do kapitału) czy wypłacane co rok
//
// Źródło marż: strony emisji na obligacjeskarbowe.pl (aktualne na czerwiec 2026).
// Marże mogą się nieznacznie różnić między emisjami — tu używamy typowych wartości.

const BOND_TYPES = {
  DOS: {
    years: 2,
    indexed: false,       // stała stopa przez cały okres
    capitalizes: true,    // odsetki kapitalizowane rocznie
    margin: 0,            // nie dotyczy (stała stopa)
  },
  TOS: {
    years: 3,
    indexed: false,       // stała stopa przez cały okres
    capitalizes: true,    // odsetki kapitalizowane rocznie
    margin: 0,            // nie dotyczy (stała stopa)
  },
  COI: {
    years: 4,
    indexed: true,        // rok 1 stała stopa, lata 2-4 = inflacja + marża
    capitalizes: false,   // odsetki WYPŁACANE co rok (nie kapitalizują)
    margin: 0.0125,       // marża 1,25% (typowa dla COI, np. COI1027)
  },
  EDO: {
    years: 10,
    indexed: true,        // rok 1 stała stopa, lata 2-10 = inflacja + marża
    capitalizes: true,    // odsetki kapitalizowane rocznie
    margin: 0.02,         // marża 2,00% (typowa dla EDO)
  },
  ROS: {
    years: 6,
    indexed: true,        // rok 1 stała stopa, lata 2-6 = inflacja + marża
    capitalizes: true,    // odsetki kapitalizowane rocznie (obligacja rodzinna)
    margin: 0.0175,       // marża 1,75% (typowa dla ROS)
  },
}

// ─── Tabela stóp procentowych 1. roku (i stałych stóp) dla konkretnych emisji ──
// Klucz: pełny kod emisji (np. "EDO1035"), wartość: stopa 1. roku (ułamek dziesiętny).
// Dla obligacji o stałym oprocentowaniu (DOS, TOS) ta sama stopa obowiązuje przez cały okres.
//
// Źródła:
//   - EDO1035: obligacjeskarbowe.pl/oferta-obligacji/obligacje-10-letnie-edo/edo1035/ → 6,00%
//   - COI1027: obligacjeskarbowe.pl/oferta-obligacji/obligacje-4-letnie-coi/coi1027/ → 7,00%
//   - TOS0326: obligacjeskarbowe.pl/oferta-obligacji/obligacje-3-letnie-tos/tos0326/ → 6,85%
//   - TOS0627: obligacjeskarbowe.pl/oferta-obligacji/obligacje-3-letnie-tos/tos0627/ → 6,20%
//
// Wartości potwierdzone na stronach emisji w dniu 2026-06-19.
// Jeśli emisji nie ma w tabeli, używamy fallbacku (średnia z ostatnich emisji danego typu).

const EMISSION_RATES = {
  // ── EDO (10-letnie, indeksowane inflacją) ──
  EDO1035: 0.06,    // emisja X.2025, stopa 1. roku = 6,00%
  EDO0636: 0.0535,  // emisja VI.2026, stopa 1. roku = 5,35%

  // ── COI (4-letnie, indeksowane inflacją) ──
  COI1027: 0.07,    // emisja X.2023, stopa 1. roku = 7,00%
  COI0630: 0.0475,  // emisja VI.2026, stopa 1. roku = 4,75%

  // ── TOS (3-letnie, stała stopa) ──
  TOS0326: 0.0685,  // emisja III.2023, stopa stała = 6,85%
  TOS0627: 0.062,   // emisja VI.2024, stopa stała = 6,20%
  TOS0629: 0.044,   // emisja VI.2026, stopa stała = 4,40%

  // ── DOS (2-letnie, stała stopa) — przykładowe emisje ──

  // ── ROS (6-letnie, indeksowane inflacją) — przykładowe emisje ──
}

// Fallbackowe stopy 1. roku (gdy emisji nie ma w tabeli).
// Używamy typowych wartości z okresu 2023-2025. PRZYBLIŻENIE — wyraźnie zaznaczone.
const FALLBACK_FIRST_YEAR_RATES = {
  EDO: 0.06,    // ~6,00% (typowe dla EDO w 2024-2025)
  COI: 0.065,   // ~6,50% (typowe dla COI w 2023-2024)
  TOS: 0.06,    // ~6,00% (typowe dla TOS w 2023-2024)
  DOS: 0.05,    // ~5,00% (typowe dla DOS)
  ROS: 0.065,   // ~6,50% (typowe dla ROS)
}

// ─── Funkcje pomocnicze ────────────────────────────────────────────────────────

/**
 * Parsuje ticker obligacji i wyciąga z niego informacje.
 * Zwraca obiekt { prefix, maturityMonth, maturityYear, maturityDate, issueDate, type }
 * lub null gdy ticker nie pasuje do wzorca.
 *
 * Czterocyfrowy sufiks to MMYY miesiąca wykupu, np.:
 *   EDO1035 → wykup w październiku (10) 2035 (35)
 *   TOS0326 → wykup w marcu (03) 2026 (26)
 *
 * Data emisji = data wykupu minus długość obligacji danego typu.
 */
export function parseBondTicker(ticker) {
  const upper = (ticker ?? '').toUpperCase()
  const match = upper.match(POLISH_BOND_REGEX)
  if (!match) return null

  const prefix = match[1]
  const mmyy = match[2]
  const month = parseInt(mmyy.slice(0, 2), 10)  // 1-12
  const yearSuffix = parseInt(mmyy.slice(2, 4), 10)

  // Rok wykupu: zakładamy lata 2000-2099
  const maturityYear = 2000 + yearSuffix

  // Data wykupu = pierwszy dzień miesiąca wykupu
  const maturityDate = new Date(maturityYear, month - 1, 1)

  // Definicja typu obligacji
  const type = BOND_TYPES[prefix]
  if (!type) return null

  // Data emisji = data wykupu minus długość obligacji
  const issueDate = new Date(maturityYear - type.years, month - 1, 1)

  return {
    prefix,
    ticker: upper,
    maturityMonth: month,
    maturityYear,
    maturityDate,
    issueDate,
    type,
  }
}

/**
 * Pobiera stopę procentową 1. roku (lub stałą stopę) dla danej emisji.
 * Najpierw szuka w tabeli EMISSION_RATES, potem w fallbacku.
 * Zwraca { rate, isEstimate } — isEstimate=true gdy użyto fallbacku.
 */
function getFirstYearRate(ticker, prefix) {
  const upper = ticker.toUpperCase()
  if (EMISSION_RATES[upper] !== undefined) {
    return { rate: EMISSION_RATES[upper], isEstimate: false }
  }
  // Fallback — przybliżenie
  const fallback = FALLBACK_FIRST_YEAR_RATES[prefix] ?? 0.05
  return { rate: fallback, isEstimate: true }
}

/**
 * Oblicza stopę procentową dla danego roku obligacji indeksowanej inflacją.
 *
 * Rok 1: stała stopa z tabeli emisji.
 * Rok N (N >= 2): inflacja roczna + marża typu.
 *
 * Reguła MF (uproszczona): stopa w danym okresie rocznym używa wskaźnika inflacji
 * ogłoszonego w miesiącu poprzedzającym start tego okresu. W praktyce: inflacja
 * za rok kalendarzowy, który skończył się ~2 miesiące przed rocznicą emisji.
 *
 * Parametry:
 *   yearIndex — numer roku obligacji (1, 2, 3, ...)
 *   firstYearRate — stopa 1. roku (ułamek dziesiętny)
 *   margin — marża typu (ułamek dziesiętny)
 *   inflation — obiekt { rok: wskaźnik }, np. { 2023: 11.4, 2024: 3.7 }
 *              wskaźnik to roczna inflacja w procentach (np. 11.4 = 11,4%)
 *   issueDate — data emisji (Date)
 *
 * Zwraca stopę procentową jako ułamek dziesiętny (np. 0.134 = 13,4%).
 */
function getRateForYear(yearIndex, firstYearRate, margin, inflation, issueDate) {
  if (yearIndex === 1) return firstYearRate

  // Rok kalendarzowy, z którego bierzemy inflację:
  // Rocznica emisji w roku yearIndex-1 to moment startu tego okresu.
  // Inflacja ogłaszana ~2 miesiące po zakończeniu roku → używamy inflacji za rok
  // kończący się przed rocznicą.
  const anniversaryYear = issueDate.getFullYear() + (yearIndex - 1)
  const inflationYear = anniversaryYear - 1

  // Inflacja w procentach (np. 11.4), konwertujemy na ułamek (0.114)
  const inflPct = inflation?.[inflationYear]
  if (inflPct === undefined || inflPct === null) {
    // Brak danych o inflacji — używamy ostatniej dostępnej lub domyślnej 4%
    const years = Object.keys(inflation ?? {}).map(Number).sort()
    const lastKnown = years.length > 0 ? inflation[years[years.length - 1]] : 4.0
    const inflRate = Math.max(0, lastKnown / 100)
    return inflRate + margin
  }

  // Minimalna stopa = 0 (MF gwarantuje że oprocentowanie nie jest ujemne)
  const inflRate = Math.max(0, inflPct / 100)
  return inflRate + margin
}

/**
 * Główna funkcja: estymuje wartość 1 sztuki obligacji w PLN.
 *
 * Parametry:
 *   ticker    — kod obligacji, np. "EDO1035"
 *   inflation — obiekt { rok: wskaźnikInflacji }, np. { 2023: 11.4, 2024: 3.7 }
 *               wskaźnik w procentach (analogiczny okres roku poprzedniego − 100)
 *   today     — bieżąca data (Date lub string YYYY-MM-DD)
 *
 * Zwraca obiekt:
 *   { valuePLN, isEstimate, matured, details }
 *   - valuePLN: wartość 1 sztuki w PLN (nominał 100 zł + naliczone odsetki)
 *   - isEstimate: true gdy użyto przybliżonych stóp (fallback)
 *   - matured: true gdy obligacja jest po wykupie
 *   - details: tekstowy opis obliczeń (do debugowania)
 *
 * Lub null gdy ticker nie jest rozpoznany.
 */
export function estimateBondValuePLN(ticker, inflation, today) {
  const parsed = parseBondTicker(ticker)
  if (!parsed) return null

  const { prefix, issueDate, maturityDate, type } = parsed
  const todayDate = typeof today === 'string' ? new Date(today) : (today ?? new Date())

  // Stopa 1. roku (lub stała stopa dla DOS/TOS)
  const { rate: firstYearRate, isEstimate } = getFirstYearRate(ticker, prefix)

  // ── Obliczenie liczby pełnych lat i ułamka bieżącego roku ──────────────────
  // Liczymy od daty emisji, nie od daty zakupu w CSV.
  const msFromIssue = todayDate.getTime() - issueDate.getTime()
  if (msFromIssue <= 0) {
    // Jeszcze przed emisją — wartość = nominał
    return { valuePLN: 100, isEstimate, matured: false, details: 'Przed emisją' }
  }

  // Liczba pełnych lat od emisji
  // Liczymy porównując daty rocznicowe, nie milisekundy (bo lata mają różne długości)
  let fullYears = 0
  while (true) {
    const nextAnniversary = new Date(issueDate.getFullYear() + fullYears + 1, issueDate.getMonth(), issueDate.getDate())
    if (nextAnniversary <= todayDate) {
      fullYears++
    } else {
      break
    }
  }

  // Czy obligacja jest po wykupie?
  const matured = todayDate >= maturityDate
  const totalYears = type.years

  if (matured) {
    // Obligacja po wykupie — wartość końcowa (pełny okres)
    return calculateMaturedValue(prefix, type, totalYears, firstYearRate, inflation, issueDate, isEstimate)
  }

  // Ograniczenie pełnych lat do okresu obligacji
  const completedYears = Math.min(fullYears, totalYears)

  // Ułamek bieżącego roku (od ostatniej rocznicy do dziś / długość roku)
  const lastAnniversary = new Date(issueDate.getFullYear() + completedYears, issueDate.getMonth(), issueDate.getDate())
  const nextAnniversary = new Date(issueDate.getFullYear() + completedYears + 1, issueDate.getMonth(), issueDate.getDate())
  const yearLengthMs = nextAnniversary.getTime() - lastAnniversary.getTime()
  const elapsedMs = todayDate.getTime() - lastAnniversary.getTime()
  const yearFraction = Math.max(0, Math.min(1, elapsedMs / yearLengthMs))

  // ── Obliczenie wartości według typu obligacji ───────────────────────────────

  if (!type.indexed) {
    // DOS / TOS — stała stopa, kapitalizacja roczna
    // Wartość = 100 × (1 + stopa)^pełneLata × (1 + stopa × ułamekRoku)
    const compounded = Math.pow(1 + firstYearRate, completedYears)
    const currentYearAccrual = 1 + firstYearRate * yearFraction
    const valuePLN = 100 * compounded * currentYearAccrual

    return {
      valuePLN,
      isEstimate,
      matured: false,
      details: `TOS/DOS: stopa=${(firstYearRate * 100).toFixed(2)}%, lata=${completedYears}, ułamek=${yearFraction.toFixed(4)}, wartość=${valuePLN.toFixed(2)} PLN`,
    }
  }

  if (type.capitalizes) {
    // EDO / ROS — rok 1 stała stopa, reszta inflacja+marża, kapitalizacja roczna
    // Wartość = 100 × iloczyn (1 + stopa_roku_i) po pełnych latach × (1 + stopa_bieżącego × ułamek)
    let product = 1
    const rates = []
    for (let y = 1; y <= completedYears; y++) {
      const rate = getRateForYear(y, firstYearRate, type.margin, inflation, issueDate)
      product *= (1 + rate)
      rates.push((rate * 100).toFixed(2))
    }

    // Stopa bieżącego (niezakończonego) roku
    const currentYearIdx = completedYears + 1
    if (currentYearIdx <= totalYears) {
      const currentRate = getRateForYear(currentYearIdx, firstYearRate, type.margin, inflation, issueDate)
      product *= (1 + currentRate * yearFraction)
      rates.push(`(${(currentRate * 100).toFixed(2)}×${yearFraction.toFixed(2)})`)
    }

    const valuePLN = 100 * product

    return {
      valuePLN,
      isEstimate,
      matured: false,
      details: `${prefix}: stopy=[${rates.join(', ')}]%, wartość=${valuePLN.toFixed(2)} PLN`,
    }
  }

  // COI — rok 1 stała stopa, lata 2-4 inflacja+marża, odsetki WYPŁACANE co rok
  // Wartość pozycji = 100 + odsetki naliczone w BIEŻĄCYM okresie rocznym
  // (poprzednie kupony zostały wypłacone jako gotówka)
  {
    const currentYearIdx = completedYears + 1
    const currentRate = getRateForYear(currentYearIdx, firstYearRate, type.margin, inflation, issueDate)
    const accruedInterest = 100 * currentRate * yearFraction
    const valuePLN = 100 + accruedInterest

    return {
      valuePLN,
      isEstimate,
      matured: false,
      details: `COI: rok=${currentYearIdx}, stopa=${(currentRate * 100).toFixed(2)}%, ułamek=${yearFraction.toFixed(4)}, odsetki=${accruedInterest.toFixed(2)}, wartość=${valuePLN.toFixed(2)} PLN`,
    }
  }
}

/**
 * Oblicza wartość obligacji po pełnym wykupie (wszystkie lata zakończone).
 */
function calculateMaturedValue(prefix, type, totalYears, firstYearRate, inflation, issueDate, isEstimate) {
  if (!type.indexed) {
    // DOS / TOS — stała stopa, kapitalizacja przez wszystkie lata
    const valuePLN = 100 * Math.pow(1 + firstYearRate, totalYears)
    return {
      valuePLN,
      isEstimate,
      matured: true,
      details: `${prefix} (wykupiony): stopa=${(firstYearRate * 100).toFixed(2)}%, lata=${totalYears}, wartość=${valuePLN.toFixed(2)} PLN`,
    }
  }

  if (type.capitalizes) {
    // EDO / ROS — iloczyn (1 + stopa) po wszystkich latach
    let product = 1
    for (let y = 1; y <= totalYears; y++) {
      const rate = getRateForYear(y, firstYearRate, type.margin, inflation, issueDate)
      product *= (1 + rate)
    }
    const valuePLN = 100 * product
    return {
      valuePLN,
      isEstimate,
      matured: true,
      details: `${prefix} (wykupiony): wartość=${valuePLN.toFixed(2)} PLN`,
    }
  }

  // COI — po wykupie wartość = nominał (kupony już wypłacone)
  return {
    valuePLN: 100,
    isEstimate,
    matured: true,
    details: `COI (wykupiony): wartość=100.00 PLN (kupony wypłacone wcześniej)`,
  }
}
