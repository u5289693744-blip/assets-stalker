import Papa from 'papaparse'

// Dozwolone wartości zgodne z formatem aplikacji (patrz CLAUDE.md).
export const ASSET_TYPES = ['stock', 'etf', 'bond', 'crypto', 'cash', 'precious_metal']
export const ACTIONS = ['buy', 'sell', 'dividend']

// Kolumny pliku CSV, w ustalonej kolejności.
const COLUMNS = ['date', 'ticker', 'name', 'type', 'action', 'quantity', 'price', 'currency', 'broker', 'comment']

/**
 * Zamienia tekst pliku CSV (pola oddzielone średnikiem) na listę transakcji.
 * Zwraca obiekt: { transactions, errors }.
 * - transactions: poprawnie odczytane wiersze (liczby zamienione na typ liczbowy)
 * - errors: lista czytelnych komunikatów o problemach (numer wiersza + opis)
 */
export function parseTransactions(csvText) {
  const result = Papa.parse(csvText, {
    delimiter: ';',
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
    transform: (value) => (typeof value === 'string' ? value.trim() : value),
  })

  const transactions = []
  const errors = []

  result.data.forEach((row, index) => {
    // +2: pomijamy wiersz nagłówka i liczymy od 1 (tak jak widzi to człowiek).
    const lineNumber = index + 2

    const quantity = Number(row.quantity)
    const price = Number(row.price)

    if (!row.ticker) {
      errors.push(`Wiersz ${lineNumber}: brak symbolu (ticker).`)
      return
    }
    if (!ASSET_TYPES.includes(row.type)) {
      errors.push(`Wiersz ${lineNumber}: nieznany typ aktywa "${row.type}".`)
      return
    }
    if (!ACTIONS.includes(row.action)) {
      errors.push(`Wiersz ${lineNumber}: nieznana operacja "${row.action}".`)
      return
    }
    if (Number.isNaN(quantity)) {
      errors.push(`Wiersz ${lineNumber}: ilość nie jest liczbą ("${row.quantity}").`)
      return
    }
    if (Number.isNaN(price)) {
      errors.push(`Wiersz ${lineNumber}: cena nie jest liczbą ("${row.price}").`)
      return
    }

    transactions.push({
      date: row.date,
      ticker: row.ticker,
      name: row.name,
      type: row.type,
      action: row.action,
      quantity,
      price,
      currency: row.currency,
      broker: row.broker,
      comment: row.comment || '',
    })
  })

  return { transactions, errors, columns: COLUMNS }
}
