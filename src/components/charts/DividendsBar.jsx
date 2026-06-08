/**
 * Wykres słupkowy — dywidendy rok po roku.
 *
 * Każdy słupek = suma dywidend otrzymanych w danym roku (w PLN).
 * Dymek po najechaniu = lista "ticker: kwota" dla tego roku.
 * Jeśli brak dywidend → łagodna informacja zamiast pustego wykresu.
 */
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

function fmtPln(usd, usdToPln) {
  if (!usdToPln) return `${usd.toFixed(0)} USD`
  const pln = usd * usdToPln
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 }).format(pln)
}

function CustomTooltip({ active, payload, usdToPln }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{point.year}</div>
      <div className="chart-tooltip-row" style={{ marginBottom: '0.35rem' }}>
        <span>Razem:</span>
        <span style={{ color: 'var(--gain)', fontWeight: 700 }}>{fmtPln(point.totalUSD, usdToPln)}</span>
      </div>
      {Object.entries(point.byTicker)
        .sort((a, b) => b[1] - a[1])
        .map(([ticker, usd]) => (
          <div key={ticker} className="chart-tooltip-row">
            <span style={{ color: 'var(--accent)' }}>{ticker}</span>
            <span>{fmtPln(usd, usdToPln)}</span>
          </div>
        ))}
    </div>
  )
}

export default function DividendsBar({ dividends, usdToPln, loading }) {
  if (loading) {
    return <p className="chart-loading">Pobieranie danych o dywidendach...</p>
  }

  if (!dividends || dividends.length === 0) {
    return (
      <p className="chart-empty">
        Brak zarejestrowanych dywidend dla posiadanych aktywów w tym portfelu.
      </p>
    )
  }

  const chartData = dividends.map((d) => ({
    year: d.year,
    totalUSD: d.totalUSD,
    totalDisplay: usdToPln ? d.totalUSD * usdToPln : d.totalUSD,
    byTicker: d.byTicker,
  }))

  const maxVal = Math.max(...chartData.map((d) => d.totalDisplay))
  const yTickFormatter = (v) => {
    if (maxVal >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
    if (maxVal >= 1_000) return `${(v / 1_000).toFixed(0)}k`
    return String(Math.round(v))
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <XAxis dataKey="year" tick={{ fill: 'var(--muted)', fontSize: 12 }} />
        <YAxis
          tickFormatter={yTickFormatter}
          tick={{ fill: 'var(--muted)', fontSize: 11 }}
          width={52}
        />
        <Tooltip content={<CustomTooltip usdToPln={usdToPln} />} />
        <Bar dataKey="totalDisplay" name="Dywidendy" radius={[4, 4, 0, 0]}>
          {chartData.map((entry) => (
            <Cell key={entry.year} fill="var(--gain)" />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
