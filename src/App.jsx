import { useEffect, useState, useRef } from 'react'
import { parseTransactions } from './lib/parsing/parseTransactions.js'
import { buildPortfolio } from './lib/portfolio/buildPortfolio.js'
import { fetchAllPrices, fetchFxRates } from './lib/prices/fetchPrices.js'
import { fetchAllHistoricalPrices } from './lib/history/fetchHistoricalPrices.js'
import { buildPortfolioHistory } from './lib/history/buildPortfolioHistory.js'
import { fetchAllDividends } from './lib/history/fetchDividends.js'
import FileLoader from './components/FileLoader.jsx'
import TransactionsTable from './components/TransactionsTable.jsx'
import PortfolioTable from './components/PortfolioTable.jsx'
import PriceProgress from './components/PriceProgress.jsx'
import SummaryPanel from './components/SummaryPanel.jsx'
import ChartsSection from './components/ChartsSection.jsx'

// Ścieżka do przykładowego pliku dołączonego do aplikacji (folder public).
const SAMPLE_URL = `${import.meta.env.BASE_URL}sample-transactions.csv`

const CURRENCY_KEY = 'asset-stalker.currency'

export default function App() {
  const [transactions, setTransactions] = useState([])
  const [errors, setErrors] = useState([])
  const [source, setSource] = useState('')

  // Waluta wyświetlania — zapamiętywana w localStorage. Domyślnie PLN.
  const [displayCurrency, setDisplayCurrency] = useState(
    () => localStorage.getItem(CURRENCY_KEY) ?? 'PLN',
  )

  function handleCurrencyChange(e) {
    const val = e.target.value
    setDisplayCurrency(val)
    localStorage.setItem(CURRENCY_KEY, val)
  }

  // Kurs walutowy z Frankfurter (EBC) — { usdToPln, eurToUsd }
  const [fx, setFx] = useState(null)

  // Ceny w USD dla każdego tickera — Map<ticker, number|null>
  const [pricesUSD, setPricesUSD] = useState(null)

  // Ceny otwarcia dnia w USD — Map<ticker, number|null>
  // Yahoo Finance: Open z dziennej świecy (dla wszystkich aktywów z ceną).
  const [openPricesUSD, setOpenPricesUSD] = useState(null)

  // Postęp pobierania cen
  const [progress, setProgress] = useState({ done: 0, total: 0, succeeded: 0, failed: 0 })
  const [failedTickers, setFailedTickers] = useState([])
  const [pricesDone, setPricesDone] = useState(false)

  // Dane historyczne — ceny miesięczne i historia portfela
  const [portfolioHistory, setPortfolioHistory] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  // Dywidendy rok po roku
  const [dividends, setDividends] = useState(null)
  const [dividendsLoading, setDividendsLoading] = useState(false)

  // Referencja do aktualnej mapy cen (do aktualizacji w trakcie fetchów)
  const pricesRef = useRef(new Map())

  // Referencja do FX potrzebna przy pobieraniu historii (fx state może być opóźniony)
  const fxRef = useRef(null)

  // Wczytanie tekstu CSV i zamiana na listę transakcji.
  function loadCsvText(csvText, sourceLabel) {
    const { transactions, errors } = parseTransactions(csvText)
    setTransactions(transactions)
    setErrors(errors)
    setSource(sourceLabel)
    // Reset stanu cen i historii przy wczytaniu nowego pliku
    setPricesUSD(null)
    setOpenPricesUSD(null)
    setProgress({ done: 0, total: 0, succeeded: 0, failed: 0 })
    setFailedTickers([])
    setPricesDone(false)
    pricesRef.current = new Map()
    setPortfolioHistory(null)
    setHistoryLoading(false)
    setDividends(null)
    setDividendsLoading(false)
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

  // Gdy mamy transakcje — pobierz kurs FX i ceny rynkowe.
  useEffect(() => {
    if (transactions.length === 0) return

    // Zbierz unikalne pozycje (ticker + type) wymagające ceny
    const seenTickers = new Set()
    const positions = []
    for (const t of transactions) {
      if (!seenTickers.has(t.ticker)) {
        seenTickers.add(t.ticker)
        positions.push({ ticker: t.ticker, type: t.type })
      }
    }

    // Liczbę tickerów wymagających ceny (krypto, stock, etf)
    const priceable = positions.filter(
      (p) => p.type === 'crypto' || p.type === 'stock' || p.type === 'etf',
    )

    setProgress({ done: 0, total: priceable.length, succeeded: 0, failed: 0 })
    setPricesDone(false)
    pricesRef.current = new Map()
    setOpenPricesUSD(null)

    let localFx = null

    // Pobierz FX najpierw (potrzebny do buildPortfolio)
    fetchFxRates().then((rates) => {
      localFx = rates
      fxRef.current = rates
      setFx(rates)
    })

    const failedList = []

    fetchAllPrices(
      positions,
      // onProgress: wywoływane po każdym zakończonym fetchu
      (done, total, succeeded, failed) => {
        setProgress({ done, total, succeeded, failed })
        // Częściowa aktualizacja — renderuj tabelę na bieżąco
        setPricesUSD(new Map(pricesRef.current))
      },
      // onDone: wywoływane gdy wszystkie fetche zakończyły się
      (finalPricesUSD, finalOpenPricesUSD) => {
        pricesRef.current = finalPricesUSD
        setPricesUSD(new Map(finalPricesUSD))
        setOpenPricesUSD(new Map(finalOpenPricesUSD))
        // Zbierz tickery bez ceny (spośród tych, które powinny mieć cenę)
        for (const { ticker, type } of priceable) {
          if (finalPricesUSD.get(ticker) === null) {
            failedList.push(ticker)
          }
        }
        setFailedTickers(failedList)
        setPricesDone(true)
      },
    )
  }, [transactions])

  // Gdy ceny bieżące są gotowe — pobierz dane historyczne i dywidendy.
  // Używamy pricesDone jako triggera, bo potrzebujemy portfolio z bieżącymi cenami
  // do pinowania punktu "dziś" w historii.
  useEffect(() => {
    if (!pricesDone || transactions.length === 0) return

    const seenTickers = new Set()
    const positions = []
    for (const t of transactions) {
      if (!seenTickers.has(t.ticker)) {
        seenTickers.add(t.ticker)
        positions.push({ ticker: t.ticker, type: t.type })
      }
    }

    const currentFx = fxRef.current
    const today = new Date().toISOString().slice(0, 10)

    // Zbuduj portfolio z bieżącymi cenami do pinowania ostatniego punktu
    const currentPrices = pricesRef.current
    const currentPortfolio = buildPortfolio(
      transactions,
      currentFx,
      currentPrices,
      new Map(), // openPrices nie potrzebne do historii
      today,
    )

    // Pobierz historyczne ceny i dywidendy równolegle
    setHistoryLoading(true)
    setDividendsLoading(true)

    fetchAllHistoricalPrices(positions, currentFx)
      .then((historicalPrices) => {
        const history = buildPortfolioHistory(
          transactions,
          currentFx,
          historicalPrices,
          currentPortfolio,
          today,
        )
        setPortfolioHistory(history)
      })
      .catch(() => {
        setPortfolioHistory([])
      })
      .finally(() => {
        setHistoryLoading(false)
      })

    fetchAllDividends(positions, transactions, currentFx)
      .then((divData) => {
        setDividends(divData)
      })
      .catch(() => {
        setDividends([])
      })
      .finally(() => {
        setDividendsLoading(false)
      })
  }, [pricesDone, transactions])

  // Portfel przeliczony z transakcji, FX i cen — odświeżany reaktywnie.
  const portfolio =
    transactions.length > 0
      ? buildPortfolio(
          transactions,
          fx,
          pricesUSD ?? new Map(),
          openPricesUSD ?? new Map(),
        )
      : null

  // Kurs USD → waluta wyświetlania (obliczenia zawsze w USD, przeliczenie tylko przy wyświetlaniu).
  // PLN: fx.usdToPln  |  USD: 1  |  EUR: 1/fx.eurToUsd (bo eurToUsd = ile USD kosztuje 1 EUR)
  let fxRate = null
  if (displayCurrency === 'USD') {
    fxRate = 1
  } else if (displayCurrency === 'PLN' && fx?.usdToPln) {
    fxRate = fx.usdToPln
  } else if (displayCurrency === 'EUR' && fx?.eurToUsd) {
    fxRate = 1 / fx.eurToUsd
  }

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
        <div className="currency-selector">
          <label htmlFor="display-currency">Waluta:</label>
          <select
            id="display-currency"
            value={displayCurrency}
            onChange={handleCurrencyChange}
          >
            <option value="PLN">PLN</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
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

      {/* Panel podsumowania — 5 kart z kluczowymi liczbami portfela */}
      {portfolio && (
        <SummaryPanel
          totalPortfolioValueUSD={portfolio.totalPortfolioValueUSD}
          totalInvestedUSD={portfolio.totalInvestedUSD}
          totalPnlUSD={portfolio.totalPnlUSD}
          totalDayChangeUSD={portfolio.totalDayChangeUSD}
          cagrPct={portfolio.cagrPct}
          rate={fxRate}
          currency={displayCurrency}
        />
      )}

      {/* Pasek postępu pobierania cen */}
      {progress.total > 0 && (
        <PriceProgress
          done={progress.done}
          total={progress.total}
          succeeded={progress.succeeded}
          failed={progress.failed}
          failedTickers={failedTickers}
        />
      )}

      {/* Główny widok: portfel pogrupowany po brokerze */}
      {portfolio && (
        <PortfolioTable portfolio={portfolio} rate={fxRate} currency={displayCurrency} />
      )}

      {/* Sekcja z czterema wykresami — po tabeli portfela */}
      {portfolio && (
        <ChartsSection
          portfolio={portfolio}
          rate={fxRate}
          currency={displayCurrency}
          history={portfolioHistory}
          historyLoading={historyLoading}
          dividends={dividends}
          dividendsLoading={dividendsLoading}
        />
      )}

      {/* Tabela surowych transakcji — poniżej portfela */}
      {transactions.length > 0 && (
        <section style={{ marginTop: '2.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
            Wszystkie transakcje
          </h2>
          <TransactionsTable transactions={transactions} />
        </section>
      )}
    </div>
  )
}
