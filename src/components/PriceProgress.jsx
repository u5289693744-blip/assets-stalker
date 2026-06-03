/**
 * Pasek postępu pobierania cen.
 * Wyświetla ile tickerów zostało już pobrane i ile się udało/nie udało.
 */
export default function PriceProgress({ done, total, succeeded, failed, failedTickers }) {
  if (total === 0) return null

  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const isFinished = done >= total

  return (
    <div className="price-progress">
      <div className="price-progress-header">
        <span className="price-progress-label">
          {isFinished ? 'Pobieranie cen: zakończono' : 'Pobieranie cen…'}
        </span>
        <span className="price-progress-counts">
          {done}/{total} —{' '}
          <span className="gain">udane: {succeeded}</span>
          {failed > 0 && (
            <>
              {', '}
              <span className="loss">nieudane: {failed}</span>
            </>
          )}
        </span>
      </div>
      <div className="price-progress-bar-bg">
        <div
          className="price-progress-bar-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
      {isFinished && failed > 0 && failedTickers?.length > 0 && (
        <p className="price-progress-failed">
          Brak ceny dla: {failedTickers.join(', ')} — te pozycje pokazują „—".
        </p>
      )}
    </div>
  )
}
