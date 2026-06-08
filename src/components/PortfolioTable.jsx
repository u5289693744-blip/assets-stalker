import { useState, useEffect, useRef } from 'react'
import TransactionHistoryModal from './TransactionHistoryModal.jsx'

/**
 * Tabela portfela pogrupowana po brokerze.
 * Każda sekcja brokera jest domyślnie zwinięta i można ją rozwinąć kliknięciem.
 *
 * Wyświetlane wartości są w wybranej walucie (przeliczone z USD po bieżącym kursie).
 * Wyjątek: kolumna "Cena zakupu" pokazuje wartości w walucie oryginalnej transakcji.
 */

function fmt(value, decimals = 2) {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString('pl-PL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function fmtDisplay(usdValue, rate, currency) {
  if (usdValue === null || usdValue === undefined) return '—'
  if (!rate) return '—'
  return fmt(usdValue * rate) + ' ' + currency
}

function fmtPct(value) {
  if (value === null || value === undefined) return '—'
  const sign = value >= 0 ? '+' : ''
  return sign + fmt(value) + '%'
}

// Kolumna "Cena zakupu" — celowo NIE przeliczana na walutę wyświetlania.
// Pokazuje dosłownie cenę, jaką użytkownik zapłacił, w oryginalnej walucie transakcji.
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

function PnlCell({ pnlUSD, rate, currency }) {
  if (pnlUSD === null || !rate) return <td className="num">—</td>
  const cls = pnlUSD >= 0 ? 'gain' : 'loss'
  const sign = pnlUSD >= 0 ? '+' : ''
  return (
    <td className={`num ${cls}`}>
      {sign}{fmt(pnlUSD * rate)} {currency}
    </td>
  )
}

function PnlPctCell({ pnlPct }) {
  if (pnlPct === null) return <td className="num">—</td>
  const cls = pnlPct >= 0 ? 'gain' : 'loss'
  return <td className={`num ${cls}`}>{fmtPct(pnlPct)}</td>
}

/**
 * Grupuje listę wypłat dywidend według miesiąca (YYYY-MM).
 * Zwraca tablicę obiektów { monthLabel, payments } posortowaną malejąco (najnowsze pierwsze).
 */
function groupByMonth(payments) {
  const map = new Map()
  for (const p of payments) {
    const monthKey = p.dateStr.slice(0, 7) // "YYYY-MM"
    if (!map.has(monthKey)) map.set(monthKey, [])
    map.get(monthKey).push(p)
  }
  // Sortuj miesiące malejąco (najnowszy na górze)
  const sorted = [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  return sorted.map(([key, pmts]) => {
    const [year, month] = key.split('-')
    const monthNames = [
      'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
      'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
    ]
    const label = `${monthNames[parseInt(month, 10) - 1]} ${year}`
    // Sortuj wypłaty w miesiącu malejąco
    const sortedPmts = [...pmts].sort((a, b) => b.dateStr.localeCompare(a.dateStr))
    return { monthKey: key, monthLabel: label, payments: sortedPmts }
  })
}

function fmtDate(dateStr) {
  // "YYYY-MM-DD" → "DD.MM.YYYY"
  const [y, m, d] = dateStr.split('-')
  return `${d}.${m}.${y}`
}

/**
 * Modal z historią dywidend dla jednego tickera.
 * Zamknięcie: kliknięcie przycisku X, tła (backdrop) lub klawisz Escape.
 */
function DividendHistoryModal({ ticker, name, payments, rate, currency, onClose }) {
  const dialogRef = useRef(null)

  // Zamykanie klawiszem Escape
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // Zablokowanie scrolla strony gdy modal jest otwarty
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const grouped = groupByMonth(payments)

  // Łączna suma dywidend (w USD) dla tego tickera
  const totalUSD = payments.reduce((s, p) => s + p.totalUSD, 0)

  function fmtAmt(usdValue) {
    if (!rate) return `${usdValue.toFixed(2)} USD`
    return (usdValue * rate).toLocaleString('pl-PL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' ' + currency
  }

  function fmtQtyInModal(qty) {
    if (qty < 0.01) return qty.toLocaleString('pl-PL', { maximumSignificantDigits: 4 })
    if (qty < 1) return qty.toLocaleString('pl-PL', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
    return qty.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: qty % 1 === 0 ? 0 : 2 })
  }

  return (
    <div
      className="div-modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label={`Historia dywidend: ${ticker}`}
      ref={dialogRef}
    >
      <div className="div-modal">
        <div className="div-modal-header">
          <div>
            <span className="ticker">{ticker}</span>
            <span className="position-name">{name}</span>
          </div>
          <div className="div-modal-header-right">
            <span className="div-modal-total">
              Razem: <strong>{fmtAmt(totalUSD)}</strong>
            </span>
            <button className="div-modal-close" onClick={onClose} aria-label="Zamknij">
              ✕
            </button>
          </div>
        </div>

        <div className="div-modal-body">
          {grouped.length === 0 ? (
            <p className="chart-empty">Brak wypłat dywidend w historii.</p>
          ) : (
            grouped.map(({ monthKey, monthLabel, payments: pmts }) => {
              const monthTotalUSD = pmts.reduce((s, p) => s + p.totalUSD, 0)
              return (
                <div key={monthKey} className="div-month-group">
                  <div className="div-month-header">
                    <span className="div-month-label">{monthLabel}</span>
                    <span className="div-month-total gain">{fmtAmt(monthTotalUSD)}</span>
                  </div>
                  <table className="div-payments-table">
                    <thead>
                      <tr>
                        <th>Data wypłaty</th>
                        <th className="num">Posiadane jednostki</th>
                        <th className="num">Na jednostkę</th>
                        <th className="num">Otrzymano</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pmts.map((p) => (
                        <tr key={p.dateStr}>
                          <td>{fmtDate(p.dateStr)}</td>
                          <td className="num">{fmtQtyInModal(p.heldQty)}</td>
                          <td className="num">{fmtAmt(p.amountPerUnitUSD)}</td>
                          <td className="num gain">{fmtAmt(p.totalUSD)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

function BrokerSection({ brokerData, rate, currency, dividendsByTicker, transactions }) {
  const [open, setOpen] = useState(false)
  // ticker dla którego aktualnie pokazujemy modal dywidend (null = zamknięty)
  const [divModalTicker, setDivModalTicker] = useState(null)
  // ticker dla którego aktualnie pokazujemy modal historii transakcji (null = zamknięty)
  const [historyModalTicker, setHistoryModalTicker] = useState(null)
  const { broker, positions, totalValueUSD, totalPnlUSD } = brokerData

  const brokerValue = rate && totalValueUSD ? fmt(totalValueUSD * rate) + ' ' + currency : '—'
  const brokerPnlCls = totalPnlUSD >= 0 ? 'gain' : 'loss'
  const brokerPnl =
    rate && totalPnlUSD !== null
      ? (totalPnlUSD >= 0 ? '+' : '') + fmt(totalPnlUSD * rate) + ' ' + currency
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
          {brokerValue}
          {brokerPnl && (
            <span className={`broker-pnl ${brokerPnlCls}`}>
              {' '}({brokerPnl})
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const tickerDivs = dividendsByTicker?.[p.ticker]
                const hasDivs = tickerDivs && tickerDivs.length > 0
                return (
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
                    <td className="num">{fmtDisplay(p.costBasisUSD, rate, currency)}</td>
                    <td className="num">{fmtDisplay(p.currentValueUSD, rate, currency)}</td>
                    <PnlCell pnlUSD={p.pnlUSD} rate={rate} currency={currency} />
                    <PnlPctCell pnlPct={p.pnlPct} />
                    <td className="num">
                      {p.portfolioSharePct !== null ? fmtPct(p.portfolioSharePct) : '—'}
                    </td>
                    <td className="position-actions">
                      <button
                        className="tx-history-btn icon-btn"
                        onClick={() => setHistoryModalTicker(p.ticker)}
                        title="Historia transakcji"
                        aria-label="Historia transakcji"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 3v5h5" />
                          <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
                          <path d="M12 7v5l4 2" />
                        </svg>
                      </button>
                      {hasDivs && (
                        <button
                          className="div-history-btn icon-btn"
                          onClick={() => setDivModalTicker(p.ticker)}
                          title="Historia dywidend"
                          aria-label="Historia dywidend"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="8" cy="8" r="6" />
                            <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
                            <path d="M7 6h1v4" />
                            <path d="m16.71 13.88.7.71-2.82 2.82" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal historii dywidend — renderowany poza tabelą, przykrywa całą stronę */}
      {divModalTicker && dividendsByTicker?.[divModalTicker] && (
        <DividendHistoryModal
          ticker={divModalTicker}
          name={positions.find((p) => p.ticker === divModalTicker)?.name ?? divModalTicker}
          payments={dividendsByTicker[divModalTicker]}
          rate={rate}
          currency={currency}
          onClose={() => setDivModalTicker(null)}
        />
      )}

      {/* Modal historii transakcji — pełna historia kupna/sprzedaży/dywidend z weryfikacją cen */}
      {historyModalTicker && (
        <TransactionHistoryModal
          ticker={historyModalTicker}
          name={positions.find((p) => p.ticker === historyModalTicker)?.name ?? historyModalTicker}
          type={positions.find((p) => p.ticker === historyModalTicker)?.type ?? 'stock'}
          broker={broker}
          transactions={transactions ?? []}
          onClose={() => setHistoryModalTicker(null)}
        />
      )}
    </div>
  )
}

export default function PortfolioTable({ portfolio, rate, currency, dividendsByTicker, transactions }) {
  if (!portfolio || portfolio.brokers.length === 0) return null

  const { brokers, totalPortfolioValueUSD } = portfolio
  const totalDisplay =
    rate && totalPortfolioValueUSD
      ? fmt(totalPortfolioValueUSD * rate) + ' ' + currency
      : '—'

  return (
    <section className="portfolio">
      <div className="portfolio-header">
        <h2>Portfel inwestycyjny</h2>
        {totalPortfolioValueUSD > 0 && (
          <span className="portfolio-total">
            Łączna wartość: <strong>{totalDisplay}</strong>
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
          nie jest tu widoczny. Wszystkie kwoty przeliczone są z USD na wybraną walutę
          według bieżącego kursu EBC — nie historycznego.
        </p>
      </div>

      {brokers.map((b) => (
        <BrokerSection
          key={b.broker}
          brokerData={b}
          rate={rate}
          currency={currency}
          dividendsByTicker={dividendsByTicker}
          transactions={transactions}
        />
      ))}
    </section>
  )
}
