/**
 * Panel podsumowania portfela — 5 kart na górze strony.
 *
 * Wszystkie obliczenia finansowe są wykonane w USD i przekazane jako props.
 * Tutaj tylko przeliczamy na PLN (wyłącznie do wyświetlania) i formatujemy.
 *
 * Karty:
 *  1. Łączna wartość — aktualna wartość wszystkiego, co posiadasz
 *  2. Zainwestowane — łączna kwota włożona w posiadane jednostki
 *  3. Zmiana dzisiaj — jak zmieniła się wartość portfela dzisiaj
 *  4. Zysk / strata od początku — niezrealizowany zysk lub strata
 *  5. Roczna stopa zwrotu (CAGR) — średnioroczny wzrost w %
 *
 * Uwaga: obligacje i gotówka są wykluczone ze wszystkich sum — nie mają
 * bieżącej ceny rynkowej. Wycena obligacji (naliczone odsetki) zostanie
 * dodana w przyszłości po stronie aplikacji.
 */

function fmt(value, decimals = 2) {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString('pl-PL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function fmtPln(usdValue, usdToPln) {
  if (usdValue === null || usdValue === undefined || !usdToPln) return '—'
  return fmt(usdValue * usdToPln) + ' PLN'
}

function fmtChange(usdValue, usdToPln) {
  if (usdValue === null || usdValue === undefined || !usdToPln) return { text: '—', cls: '' }
  const pln = usdValue * usdToPln
  const sign = pln >= 0 ? '+' : ''
  const cls = pln >= 0 ? 'gain' : 'loss'
  return { text: sign + fmt(pln) + ' PLN', cls }
}

function fmtCagr(cagrPct) {
  if (cagrPct === null || cagrPct === undefined) return { text: '—', cls: '' }
  const sign = cagrPct >= 0 ? '+' : ''
  const cls = cagrPct >= 0 ? 'gain' : 'loss'
  return { text: sign + fmt(cagrPct) + '%', cls }
}

/**
 * Pojedyncza karta panelu.
 * valueClass: opcjonalna klasa CSS ("gain" / "loss") do kolorowania wartości.
 * tooltip: krótkie objaśnienie terminu finansowego (wyświetlane pod etykietą).
 */
function SummaryCard({ label, value, valueClass, tooltip }) {
  return (
    <div className="summary-card">
      <span className={`summary-value${valueClass ? ' ' + valueClass : ''}`}>{value}</span>
      <span className="summary-label">{label}</span>
      {tooltip && <span className="summary-tooltip">{tooltip}</span>}
    </div>
  )
}

/**
 * Props:
 *   totalPortfolioValueUSD — łączna wartość portfela w USD (ta sama liczba co w PortfolioTable)
 *   totalInvestedUSD       — łączna kwota zainwestowana w posiadane jednostki (USD)
 *   totalPnlUSD            — łączny zysk/strata w USD (null gdy brak cen)
 *   totalDayChangeUSD      — zmiana wartości portfela dzisiaj w USD (null gdy brak cen otwarcia)
 *   cagrPct                — roczna stopa zwrotu CAGR w % (null gdy za mało danych)
 *   usdToPln               — kurs USD→PLN z Frankfurter/EBC (null gdy niedostępny)
 */
export default function SummaryPanel({
  totalPortfolioValueUSD,
  totalInvestedUSD,
  totalPnlUSD,
  totalDayChangeUSD,
  cagrPct,
  usdToPln,
}) {
  const dayChange = fmtChange(totalDayChangeUSD, usdToPln)
  const pnl = fmtChange(totalPnlUSD, usdToPln)
  const cagr = fmtCagr(cagrPct)

  return (
    <section className="summary summary-portfolio">
      <SummaryCard
        label="Łączna wartość"
        value={fmtPln(totalPortfolioValueUSD, usdToPln)}
        tooltip="Aktualna wartość wszystkiego, co posiadasz, przeliczona po dzisiejszym kursie."
      />
      <SummaryCard
        label="Zainwestowane"
        value={fmtPln(totalInvestedUSD, usdToPln)}
        tooltip="Łączna kwota, którą włożyłeś w posiadane aktywa (według ceny zakupu)."
      />
      <SummaryCard
        label="Zmiana dzisiaj"
        value={dayChange.text}
        valueClass={dayChange.cls}
        tooltip="O ile zmieniła się wartość portfela od otwarcia rynku dziś."
      />
      <SummaryCard
        label="Zysk / strata od początku"
        value={pnl.text}
        valueClass={pnl.cls}
        tooltip="Zysk niezrealizowany — różnica między wartością dziś a kosztem zakupu. Aktywa nadal trzymasz, więc liczba zmienia się razem z rynkiem."
      />
      <SummaryCard
        label="Roczna stopa zwrotu (CAGR)"
        value={cagr.text}
        valueClass={cagr.cls}
        tooltip="CAGR — średnioroczny wzrost portfela od pierwszego zakupu. Mówi, ile procent rocznie zarabiałeś, gdyby wzrost był równomierny."
      />
    </section>
  )
}
