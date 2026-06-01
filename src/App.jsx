import { useEffect, useState } from 'react'
import { parseTransactions } from './lib/parsing/parseTransactions.js'
import FileLoader from './components/FileLoader.jsx'
import TransactionsTable from './components/TransactionsTable.jsx'

// Ścieżka do przykładowego pliku dołączonego do aplikacji (folder public).
const SAMPLE_URL = `${import.meta.env.BASE_URL}sample-transactions.csv`

export default function App() {
  const [transactions, setTransactions] = useState([])
  const [errors, setErrors] = useState([])
  const [source, setSource] = useState('')

  // Wczytanie tekstu CSV i zamiana na listę transakcji.
  function loadCsvText(csvText, sourceLabel) {
    const { transactions, errors } = parseTransactions(csvText)
    setTransactions(transactions)
    setErrors(errors)
    setSource(sourceLabel)
  }

  async function loadSample() {
    const response = await fetch(SAMPLE_URL)
    const text = await response.text()
    loadCsvText(text, 'przykład dołączony do aplikacji')
  }

  // Po otwarciu strony od razu pokazujemy przykładowe dane.
  useEffect(() => {
    loadSample()
  }, [])

  // Zliczenie transakcji według waluty — bez mieszania walut, zgodnie z zasadą projektu.
  const byCurrency = transactions.reduce((acc, t) => {
    acc[t.currency] = (acc[t.currency] || 0) + 1
    return acc
  }, {})

  return (
    <div className="app">
      <header>
        <h1>asset-stalker</h1>
        <p className="subtitle">Twój portfel inwestycyjny z jednego pliku CSV.</p>
      </header>

      <section className="controls">
        <FileLoader
          onFileText={(text) => loadCsvText(text, 'własny plik')}
          onLoadSample={loadSample}
        />
        {source && (
          <p className="source">
            Źródło danych: <strong>{source}</strong> — wczytano{' '}
            <strong>{transactions.length}</strong> transakcji.
          </p>
        )}
      </section>

      {errors.length > 0 && (
        <section className="errors">
          <h2>Wiersze pominięte ({errors.length})</h2>
          <ul>
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="summary">
        {Object.entries(byCurrency).map(([currency, count]) => (
          <div className="summary-card" key={currency}>
            <span className="summary-value">{count}</span>
            <span className="summary-label">transakcji w {currency}</span>
          </div>
        ))}
      </section>

      <section className="note">
        <p>
          To dopiero pierwszy widok: lista Twoich transakcji. Aktualne wartości,
          zyski i straty oraz wykresy dołączymy w kolejnych krokach. Wszystkie
          obliczenia będziemy prowadzić w dolarach (USD), a wynik pokażemy w
          złotówkach (PLN).
        </p>
      </section>

      {transactions.length > 0 && <TransactionsTable transactions={transactions} />}
    </div>
  )
}
