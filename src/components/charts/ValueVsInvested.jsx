/**
 * Wykres liniowy — aktualna wartość portfela vs zainwestowane w czasie.
 *
 * Dwie linie po miesiącach:
 *  - "Aktualna wartość" (zielona) — wartość rynkowa posiadanych pozycji
 *  - "Zainwestowane" (niebieska) — ile gotówki włożono (koszt zakupów minus sprzedaże)
 *
 * SPÓJNOŚĆ: ostatni punkt obu linii jest pinowany do wyników buildPortfolio,
 * więc zawsze równa się wartościom z panelu podsumowania.
 *
 * Wyświetlamy wartości w wybranej walucie (przeliczenie bieżącym kursem FX).
 */
import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

// Zakresy czasu — takie same jak na wykresie „Skład portfela w czasie".
const RANGES = [
  { label: '6M', months: 6 },
  { label: '1R', months: 12 },
  { label: '5L', months: 60 },
  { label: 'Cały', months: null },
]

function fmtDisplay(usd, rate, currency) {
  if (rate == null) return `${(usd / 1000).toFixed(0)}k USD`
  const val = usd * rate
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)} mln ${currency}`
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}k ${currency}`
  return `${val.toFixed(0)} ${currency}`
}

function CustomTooltip({ active, payload, label, rate, currency }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{label}</div>
      {payload.map((entry) => {
        // entry.value jest JUŻ w walucie wyświetlania (przeliczone w chartData). Nie mnożymy ponownie.
        const formatted = rate
          ? new Intl.NumberFormat('pl-PL', {
              style: 'currency',
              currency: currency,
              maximumFractionDigits: 0,
            }).format(entry.value)
          : `${entry.value.toFixed(0)} USD`
        return (
          <div key={entry.dataKey} className="chart-tooltip-row">
            <span style={{ color: entry.color }}>{entry.name}</span>
            <span>{formatted}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function ValueVsInvested({ history, rate, currency, loading }) {
  const [range, setRange] = useState(null) // null = cały okres

  if (loading) {
    return <p className="chart-loading">Pobieranie danych historycznych...</p>
  }

  if (!history || history.length === 0) {
    return <p className="chart-empty">Brak danych historycznych do wyświetlenia.</p>
  }

  // Zawęź dane do wybranego zakresu (ostatnie N miesięcy).
  const filtered = range === null ? history : history.slice(-range)

  const chartData = filtered.map((point) => ({
    label: point.label,
    valueDisp: rate ? point.totalValueUSD * rate : point.totalValueUSD,
    investedDisp: rate ? point.totalInvestedUSD * rate : point.totalInvestedUSD,
  }))

  // Etykieta osi Y
  const maxVal = Math.max(...chartData.map((d) => Math.max(d.valueDisp, d.investedDisp)))
  const yTickFormatter = (v) => {
    if (maxVal >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
    if (maxVal >= 1_000) return `${(v / 1_000).toFixed(0)}k`
    return String(Math.round(v))
  }

  const displayCurrency = rate ? currency : 'USD'

  return (
    <div>
      <div className="chart-range-buttons">
        {RANGES.map(({ label, months }) => (
          <button
            key={label}
            className={`chart-range-btn${range === months ? ' active' : ''}`}
            onClick={() => setRange(months)}
          >
            {label}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tick={{ fill: 'var(--muted)', fontSize: 11 }}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={yTickFormatter}
          tick={{ fill: 'var(--muted)', fontSize: 11 }}
          width={52}
        />
        <Tooltip
          content={<CustomTooltip rate={rate} currency={currency} />}
        />
        <Legend
          formatter={(value) => (
            <span style={{ color: 'var(--text)', fontSize: '0.82rem' }}>{value}</span>
          )}
        />
        <Line
          type="monotone"
          dataKey="valueDisp"
          name={`Aktualna wartość (${displayCurrency})`}
          stroke="var(--gain)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="investedDisp"
          name={`Zainwestowane (${displayCurrency})`}
          stroke="var(--accent)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
      </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
