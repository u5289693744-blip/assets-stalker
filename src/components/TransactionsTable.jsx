// Tabela ze wszystkimi wczytanymi transakcjami.
const ACTION_LABELS = {
  buy: 'Kupno',
  sell: 'Sprzedaż',
  dividend: 'Dywidenda',
}

const TYPE_LABELS = {
  stock: 'Akcje',
  etf: 'ETF',
  bond: 'Obligacje',
  crypto: 'Krypto',
  cash: 'Gotówka',
  precious_metal: 'Metal',
}

export default function TransactionsTable({ transactions }) {
  return (
    <table className="transactions">
      <thead>
        <tr>
          <th>Data</th>
          <th>Symbol</th>
          <th>Nazwa</th>
          <th>Typ</th>
          <th>Operacja</th>
          <th className="num">Ilość</th>
          <th className="num">Cena</th>
          <th>Waluta</th>
          <th>Broker</th>
          <th>Komentarz</th>
        </tr>
      </thead>
      <tbody>
        {transactions.map((t, i) => (
          <tr key={i} className={t.action === 'sell' ? 'row-sell' : ''}>
            <td>{t.date}</td>
            <td className="ticker">{t.ticker}</td>
            <td>{t.name}</td>
            <td>{TYPE_LABELS[t.type] ?? t.type}</td>
            <td>{ACTION_LABELS[t.action] ?? t.action}</td>
            <td className="num">{t.quantity}</td>
            <td className="num">{t.price.toFixed(2)}</td>
            <td>{t.currency}</td>
            <td>{t.broker}</td>
            <td className="comment">{t.comment}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
