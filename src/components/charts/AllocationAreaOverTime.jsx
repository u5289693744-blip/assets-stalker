/**
 * Wykres warstwowy obszarowy 100% — udział typów aktywów w portfelu w czasie.
 *
 * Każda warstwa = typ aktywa (stock, etf, crypto, ...).
 * Wysokość warstwy w danym miesiącu = (wartość tego typu / suma wartości portfela) × 100%.
 * Wszystkie warstwy razem = zawsze 100%.
 *
 * Przyciski zakresu: 1M, 6M, 1R, 5L, cały okres.
 */
import { useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const TYPE_COLORS = {
  stock: '#38bdf8',
  etf: '#818cf8',
  crypto: '#f59e0b',
  bond: '#4ade80',
  cash: '#94a3b8',
  precious_metal: '#fcd34d',
}

const TYPE_LABELS = {
  stock: 'Akcje',
  etf: 'ETF',
  crypto: 'Kryptowaluty',
  bond: 'Obligacje',
  cash: 'Gotówka',
  precious_metal: 'Metale szlachetne',
}

const RANGES = [
  { label: '6M', months: 6 },
  { label: '1R', months: 12 },
  { label: '5L', months: 60 },
  { label: 'Cały', months: null },
]

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{label}</div>
      {[...payload].reverse().map((entry) => (
        <div key={entry.dataKey} className="chart-tooltip-row">
          <span style={{ color: entry.fill }}>{entry.name}</span>
          <span>{`${entry.value?.toFixed(1)}%`}</span>
        </div>
      ))}
    </div>
  )
}

export default function AllocationAreaOverTime({ history, loading }) {
  const [range, setRange] = useState(null) // null = cały okres

  if (loading) {
    return <p className="chart-loading">Pobieranie danych historycznych...</p>
  }

  if (!history || history.length === 0) {
    return <p className="chart-empty">Brak danych historycznych do wyświetlenia.</p>
  }

  // Filtrowanie zakresu
  const filtered =
    range === null
      ? history
      : history.slice(-range)

  // Zbierz wszystkie typy, które mają jakiekolwiek wartości
  const allTypes = ['stock', 'etf', 'crypto', 'bond', 'cash', 'precious_metal']
  const activeTypes = allTypes.filter((type) =>
    filtered.some((p) => (p.byType[type] ?? 0) > 0)
  )

  // Przelicz na dane procentowe dla Recharts
  const chartData = filtered.map((point) => {
    const total = Object.values(point.byType).reduce((s, v) => s + v, 0)
    const row = { label: point.label }
    if (total === 0) {
      for (const type of activeTypes) row[type] = 0
      return row
    }
    for (const type of activeTypes) {
      row[type] = parseFloat((((point.byType[type] ?? 0) / total) * 100).toFixed(2))
    }
    // Wyrównaj sumę do dokładnie 100% — drobną różnicę z zaokrągleń każdej warstwy
    // dorzucamy do największej warstwy (korekta niewidoczna gołym okiem).
    const sum = activeTypes.reduce((s, t) => s + row[t], 0)
    if (sum !== 100 && activeTypes.length > 0) {
      const biggest = activeTypes.reduce((a, b) => (row[a] >= row[b] ? a : b))
      row[biggest] = parseFloat((row[biggest] + (100 - sum)).toFixed(2))
    }
    return row
  })

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
        <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={(v) => `${v}%`}
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            allowDataOverflow={true}
            width={46}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(value) => (
              <span style={{ color: 'var(--text)', fontSize: '0.82rem' }}>
                {TYPE_LABELS[value] ?? value}
              </span>
            )}
          />
          {activeTypes.map((type) => (
            <Area
              key={type}
              type="monotone"
              dataKey={type}
              name={TYPE_LABELS[type] ?? type}
              stackId="1"
              stroke={TYPE_COLORS[type] ?? '#64748b'}
              fill={TYPE_COLORS[type] ?? '#64748b'}
              fillOpacity={0.85}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
