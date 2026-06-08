/**
 * Wykres kołowy — bieżący podział portfela według typu aktywa.
 *
 * Dane wejściowe pochodzi z portfolio.brokers (bieżące ceny z buildPortfolio).
 * Suma wszystkich wycinków = totalPortfolioValueUSD.
 */
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'

// Kolory poszczególnych typów aktywów
const TYPE_COLORS = {
  stock: '#38bdf8',       // akcent (niebieski)
  etf: '#818cf8',         // fioletowy
  crypto: '#f59e0b',      // pomarańczowy
  bond: '#4ade80',        // zielony
  cash: '#94a3b8',        // szary
  precious_metal: '#fcd34d', // złoty
}

const TYPE_LABELS = {
  stock: 'Akcje',
  etf: 'ETF',
  crypto: 'Kryptowaluty',
  bond: 'Obligacje',
  cash: 'Gotówka',
  precious_metal: 'Metale szlachetne',
}

/**
 * Formatuje liczbę jako PLN (zaokrąglenie do groszy, separator tysięcy).
 */
function fmtPln(usd, usdToPln) {
  if (usdToPln == null) return `${usd.toFixed(0)} USD`
  const pln = usd * usdToPln
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 }).format(pln)
}

/**
 * Etykieta wyświetlana bezpośrednio na wycinku — procent udziału.
 */
function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  if (percent < 0.04) return null // pomijamy bardzo małe wycinki
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.6
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="#0f172a" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

/**
 * Własny dymek tooltip — pokazuje nazwę, wartość PLN i udział %.
 */
function CustomTooltip({ active, payload, usdToPln }) {
  if (!active || !payload?.length) return null
  const entry = payload[0]
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{entry.name}</div>
      <div className="chart-tooltip-row">
        <span>{fmtPln(entry.value, usdToPln)}</span>
        <span className="chart-tooltip-pct">{`${(entry.payload.percent * 100).toFixed(1)}%`}</span>
      </div>
    </div>
  )
}

export default function AllocationPie({ portfolio, usdToPln }) {
  if (!portfolio) return null

  // Grupuj currentValueUSD pozycji z ceną według typu
  const typeMap = new Map()
  for (const broker of portfolio.brokers) {
    for (const pos of broker.positions) {
      if (pos.currentValueUSD === null) continue
      const prev = typeMap.get(pos.type) ?? 0
      typeMap.set(pos.type, prev + pos.currentValueUSD)
    }
  }

  if (typeMap.size === 0) {
    return <p className="chart-empty">Brak danych do wykresu (brak wycenionych pozycji).</p>
  }

  // Posortuj malejąco po wartości
  const data = [...typeMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, valueUSD]) => ({
      name: TYPE_LABELS[type] ?? type,
      value: valueUSD,
      type,
      percent: valueUSD / portfolio.totalPortfolioValueUSD,
    }))

  return (
    <ResponsiveContainer width="100%" height={320}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={120}
          labelLine={false}
          label={PieLabel}
        >
          {data.map((entry) => (
            <Cell key={entry.type} fill={TYPE_COLORS[entry.type] ?? '#64748b'} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip usdToPln={usdToPln} />} />
        <Legend
          formatter={(value) => <span style={{ color: 'var(--text)', fontSize: '0.85rem' }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
