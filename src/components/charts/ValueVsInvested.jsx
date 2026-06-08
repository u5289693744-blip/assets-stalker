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
 * Wyświetlamy wartości w PLN (przeliczenie bieżącym kursem FX).
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

function fmtPln(usd, usdToPln) {
  if (usdToPln == null) return `${(usd / 1000).toFixed(0)}k USD`
  const pln = usd * usdToPln
  if (pln >= 1_000_000) return `${(pln / 1_000_000).toFixed(2)} mln zł`
  if (pln >= 1_000) return `${(pln / 1_000).toFixed(1)}k zł`
  return `${pln.toFixed(0)} zł`
}

function CustomTooltip({ active, payload, label, usdToPln }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{label}</div>
      {payload.map((entry) => {
        // entry.value jest JUŻ w walucie wyświetlania (PLN gdy znamy kurs, inaczej USD) —
        // wartości linii (valuePLN/investedPLN) są przeliczone w chartData. Nie mnożymy ponownie.
        const formatted = usdToPln
          ? new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 }).format(entry.value)
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

export default function ValueVsInvested({ history, usdToPln, loading }) {
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
    valuePLN: usdToPln ? point.totalValueUSD * usdToPln : point.totalValueUSD,
    investedPLN: usdToPln ? point.totalInvestedUSD * usdToPln : point.totalInvestedUSD,
    // Zachowujemy oryginalne USD do tooltipa
    valueUSD: point.totalValueUSD,
    investedUSD: point.totalInvestedUSD,
  }))

  // Etykieta osi Y
  const maxVal = Math.max(...chartData.map((d) => Math.max(d.valuePLN, d.investedPLN)))
  const yTickFormatter = (v) => {
    if (maxVal >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
    if (maxVal >= 1_000) return `${(v / 1_000).toFixed(0)}k`
    return String(Math.round(v))
  }

  const currency = usdToPln ? 'PLN' : 'USD'

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
          content={<CustomTooltip usdToPln={usdToPln} />}
        />
        <Legend
          formatter={(value) => (
            <span style={{ color: 'var(--text)', fontSize: '0.82rem' }}>{value}</span>
          )}
        />
        <Line
          type="monotone"
          dataKey="valuePLN"
          name={`Aktualna wartość (${currency})`}
          stroke="var(--gain)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="investedPLN"
          name={`Zainwestowane (${currency})`}
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
