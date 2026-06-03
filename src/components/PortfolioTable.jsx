import { useState } from 'react'

/**
 * Tabela portfela pogrupowana po brokerze.
 * Każda sekcja brokera jest domyślnie zwinięta i można ją rozwinąć kliknięciem.
 *
 * Wyświetlane wartości są w PLN (przeliczone z USD po bieżącym kursie).
 * Wyjątek: kolumna "Cena zakupu" pokazuje wartości w walucie oryginalnej transakcji.
 */

function fmt(value, decimals = 2) {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString('pl-PL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function fmtPln(usdValue, usdToPln) {
  if (usdValue === null || usdValue === undefined) return '—'
  if (!usdToPln) return '—'
  return fmt(usdValue * usdToPln) + ' PLN'
}

function fmtPct(value) {
  if (value === null || value === undefined) return '—'
  const sign = value >= 0 ? '+' : ''
  return sign + fmt(value) + '%'
}

function fmtPricePaid(min, max, currency) {
  if (min === undefined || max === undefined) return '—'
  if (min === max) return fmt(min) + ' ' + currency
  return fmt(min) + '–' + fmt(max) + ' ' + currency
}

function fmtQty(qty) {
  // Dla małych liczb (krypto) pokaż więcej miejsc po przecinku
  if (qty < 0.01) return qty.toLocaleString('pl-PL', { maximumSignificantDigits: 4 })
  if (qty < 1) return fmt(qty, 4)
  return fmt(qty, qty % 1 === 0 ? 0 : 2)
}

function PnlCell({ pnlUSD, usdToPln }) {
  if (pnlUSD === null || !usdToPln) return <td className="num">—</td>
  const cls = pnlUSD >= 0 ? 'gain' : 'loss'
  const sign = pnlUSD >= 0 ? '+' : ''
  return (
    <td className={`num ${cls}`}>
      {sign}{fmt(pnlUSD * usdToPln)} PLN
    </td>
  )
}

function PnlPctCell({ pnlPct }) {
  if (pnlPct === null) return <td className="num">—</td>
  const cls = pnlPct >= 0 ? 'gain' : 'loss'
  return <td className={`num ${cls}`}>{fmtPct(pnlPct)}</td>
}

function BrokerSection({ brokerData, usdToPln }) {
  const [open, setOpen] = useState(false)
  const { broker, positions, totalValueUSD, totalPnlUSD } = brokerData

  const brokerValuePln = usdToPln && totalValueUSD ? fmt(totalValueUSD * usdToPln) + ' PLN' : '—'
  const brokerPnlCls = totalPnlUSD >= 0 ? 'gain' : 'loss'
  const brokerPnlPln =
    usdToPln && totalPnlUSD !== null
      ? (totalPnlUSD >= 0 ? '+' : '') + fmt(totalPnlUSD * usdToPln) + ' PLN'
      : null

  return (
    <div className="broker-section">
      <button
        className="broker-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="broker-chevron">{open ? '▾' : '▸'}</span>
        <span className="broker-name">{broker}</span>
        <span className="broker-summary">
          {brokerValuePln}
          {brokerPnlPln && (
            <span className={`broker-pnl ${brokerPnlCls}`}>
              {' '}({brokerPnlPln})
            </span>
          )}
        </span>
      </button>

      {open && (
        <div className="broker-positions">
          <table className="portfolio-table">
            <thead>
              <tr>
                <th>Aktywo</th>
                <th className="num">Ilość</th>
                <th className="num">Cena zakupu</th>
                <th className="num">Trzymam (dni)</th>
                <th className="num">Zainwestowane</th>
                <th className="num">Wartość dziś</th>
                <th className="num">Zysk / strata</th>
                <th className="num">Zmiana %</th>
                <th className="num">Udział</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.ticker}>
                  <td>
                    <span className="ticker">{p.ticker}</span>
                    <span className="position-name">{p.name}</span>
                  </td>
                  <td className="num">{fmtQty(p.heldQty)}</td>
                  <td className="num">
                    {fmtPricePaid(
                      p.minPricePaid?.price,
                      p.maxPricePaid?.price,
                      p.minPricePaid?.currency,
                    )}
                  </td>
                  <td className="num">{p.holdingDays}</td>
                  <td className="num">{fmtPln(p.costBasisUSD, usdToPln)}</td>
                  <td className="num">{fmtPln(p.currentValueUSD, usdToPln)}</td>
                  <PnlCell pnlUSD={p.pnlUSD} usdToPln={usdToPln} />
                  <PnlPctCell pnlPct={p.pnlPct} />
                  <td className="num">
                    {p.portfolioSharePct !== null ? fmtPct(p.portfolioSharePct) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function PortfolioTable({ portfolio, usdToPln }) {
  if (!portfolio || portfolio.brokers.length === 0) return null

  const { brokers, totalPortfolioValueUSD } = portfolio
  const totalPln = usdToPln && totalPortfolioValueUSD
    ? fmt(totalPortfolioValueUSD * usdToPln) + ' PLN'
    : '—'

  return (
    <section className="portfolio">
      <div className="portfolio-header">
        <h2>Portfel inwestycyjny</h2>
        {totalPortfolioValueUSD > 0 && (
          <span className="portfolio-total">
            Łączna wartość: <strong>{totalPln}</strong>
          </span>
        )}
      </div>

      <div className="note portfolio-note">
        <p>
          <strong>Jak czytać tę tabelę?</strong> Każdy broker jest osobną sekcją — kliknij,
          żeby rozwinąć. <strong>Cena zakupu</strong> to min–max cen, które faktycznie
          zapłaciłeś (w oryginalnej walucie transakcji). <strong>Zainwestowane</strong> to
          łączny koszt posiadanych jednostek według średniej ceny zakupu — nie wlicza
          sprzedanych. <strong>Zysk / strata</strong> to różnica między wartością dziś a
          kosztem zakupu; jest to <em>zysk niezrealizowany</em> — aktywo nadal trzymasz,
          więc zysk/strata zmienia się razem z rynkiem. Zrealizowany zysk (ze sprzedaży)
          nie jest tu widoczny. Wszystkie kwoty przeliczone są z USD na PLN według
          bieżącego kursu EBC — nie historycznego.
        </p>
      </div>

      {brokers.map((b) => (
        <BrokerSection key={b.broker} brokerData={b} usdToPln={usdToPln} />
      ))}
    </section>
  )
}
