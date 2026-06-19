/**
 * Pobieranie rocznych wskaźników inflacji z API Głównego Urzędu Statystycznego (GUS).
 *
 * Inflacja to wzrost ogólnego poziomu cen — jeśli inflacja wynosi 11,4%,
 * to koszyk zakupów, który rok temu kosztował 100 zł, teraz kosztuje 111,40 zł.
 *
 * Polskie obligacje indeksowane inflacją (EDO, COI, ROS) używają rocznego wskaźnika
 * inflacji GUS do ustalenia oprocentowania w kolejnych latach. Dlatego potrzebujemy
 * tych danych, żeby oszacować bieżącą wartość takich obligacji.
 *
 * Źródło danych:
 *   API BDL GUS: https://bdl.stat.gov.pl/api/v1/
 *   Zmienne: kwartalne wskaźniki CPI ogółem (analogiczny okres roku poprzedniego = 100)
 *   Q1: 479365, Q2: 479371, Q3: 479355, Q4: 479340
 *   Średnia z 4 kwartałów = przybliżona roczna inflacja.
 *
 * Proxy: w trybie deweloperskim (npm run dev) zapytania idą przez /api/gus/api/v1/...
 * → bdl.stat.gov.pl (CORS blokuje bezpośrednie zapytania z przeglądarki).
 *
 * Fallback: jeśli API GUS nie odpowiada, używamy wbudowanej tabelki z danymi
 * historycznymi (2019-2025), żeby aplikacja nie przestała działać.
 */

// ─── Identyfikatory zmiennych CPI w API GUS ──────────────────────────────────
// "ogółem - analogiczny okres poprzedniego roku = 100" — wskaźnik kwartalny
// Wartość 104.5 oznacza inflację 4,5% w porównaniu z tym samym kwartałem rok wcześniej.
const CPI_VARIABLE_IDS = {
  Q1: 479365,
  Q2: 479371,
  Q3: 479355,
  Q4: 479340,
}

// ─── Wbudowane dane historyczne (fallback) ─────────────────────────────────────
// Roczna inflacja CPI w Polsce (w procentach, np. 14.4 = 14,4%).
// Źródło: GUS, dane roczne za lata 2019-2025.
// Używane gdy API GUS nie odpowiada lub zwraca błąd.
const FALLBACK_INFLATION = {
  2019: 2.3,    // niska inflacja
  2020: 3.4,    // początek wzrostu cen
  2021: 5.1,    // przyspieszenie inflacji
  2022: 14.4,   // szczyt inflacji (kryzys energetyczny, wojna)
  2023: 11.4,   // nadal wysoka, ale spadająca
  2024: 3.7,    // powrót do niższych poziomów
  2025: 4.0,    // szacunek na podstawie Q1 2025 (4,9%) i Q2 (4,1%)
}

/**
 * Pobiera roczne wskaźniki inflacji z API GUS.
 *
 * Zwraca obiekt { rok: inflacjaProcentowa }, np. { 2023: 11.4, 2024: 3.7 }
 * Wartość to inflacja w procentach (wskaźnik GUS minus 100).
 *
 * Strategia: pobieramy kwartalne CPI (rok do roku) i uśredniamy 4 kwartały
 * do jednej liczby rocznej. To dobre przybliżenie rocznej inflacji.
 *
 * Parametry:
 *   years — tablica lat do pobrania (domyślnie 2019-2026)
 *
 * Zwraca:
 *   { data: { rok: inflacja% }, source: 'gus'|'fallback' }
 */
export async function fetchInflation(years) {
  const yearList = years ?? [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]
  const yearParams = yearList.map(y => `year=${y}`).join('&')

  try {
    // Pobierz dane z 4 kwartałów równolegle
    const fetches = Object.entries(CPI_VARIABLE_IDS).map(async ([quarter, varId]) => {
      const url = `/api/gus/api/v1/data/by-variable/${varId}?format=json&${yearParams}&unit-level=0`
      const res = await fetch(url)
      if (!res.ok) return null
      const json = await res.json()
      // Struktura: results[0].values = [{ year: "2023", val: 117.0 }, ...]
      const values = json?.results?.[0]?.values
      if (!Array.isArray(values)) return null
      return { quarter, values }
    })

    const results = await Promise.all(fetches)
    const validResults = results.filter(r => r !== null)

    // Jeśli żaden kwartał nie odpowiedział — fallback
    if (validResults.length === 0) {
      console.warn('[fetchInflation] API GUS nie odpowiada — używam wbudowanych danych')
      return { data: { ...FALLBACK_INFLATION }, source: 'fallback' }
    }

    // Zbierz wartości kwartalnych CPI pogrupowane po roku
    const byYear = {}  // { rok: [wartość_Q1, wartość_Q2, ...] }
    for (const { values } of validResults) {
      for (const { year, val } of values) {
        const y = parseInt(year, 10)
        if (!byYear[y]) byYear[y] = []
        byYear[y].push(val)  // val to wskaźnik, np. 117.0
      }
    }

    // Uśrednij kwartały do rocznej inflacji
    const inflation = {}
    for (const [year, vals] of Object.entries(byYear)) {
      const avg = vals.reduce((s, v) => s + v, 0) / vals.length
      // Wskaźnik 104.5 → inflacja 4.5%
      inflation[parseInt(year, 10)] = parseFloat((avg - 100).toFixed(1))
    }

    // Uzupełnij brakujące lata z fallbacku
    for (const [year, val] of Object.entries(FALLBACK_INFLATION)) {
      if (inflation[parseInt(year, 10)] === undefined) {
        inflation[parseInt(year, 10)] = val
      }
    }

    return { data: inflation, source: 'gus' }
  } catch (err) {
    console.warn('[fetchInflation] Błąd pobierania inflacji z GUS:', err.message)
    return { data: { ...FALLBACK_INFLATION }, source: 'fallback' }
  }
}
