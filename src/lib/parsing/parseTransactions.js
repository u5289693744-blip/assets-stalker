import Papa from 'papaparse'

// Dozwolone wartości zgodne z formatem aplikacji (patrz CLAUDE.md).
export const ASSET_TYPES = ['stock', 'etf', 'bond', 'crypto', 'cash', 'precious_metal']
export const ACTIONS = ['buy', 'sell', 'dividend']

// Kolumny pliku CSV, w ustalonej kolejności.
const COLUMNS = ['date', 'ticker', 'name', 'type', 'action', 'quantity', 'price', 'currency', 'broker', 'comment']

// Wzorzec daty: RRRR-MM-DD GG:MM:SS
const DATE_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

// Sprawdza, czy ciąg tekstowy to sensowna data (np. 2024-13-01 nie istnieje).
function isValidDate(str) {
  if (!DATE_RE.test(str)) return false
  const [datePart] = str.split(' ')
  const d = new Date(datePart)
  return !Number.isNaN(d.getTime())
}

/**
 * Zamienia tekst pliku CSV (pola oddzielone średnikiem) na listę transakcji.
 * Zwraca obiekt: { transactions, errors, columns }.
 * - transactions: poprawnie odczytane wiersze (liczby zamienione na typ liczbowy)
 * - errors: lista obiektów { line, field, message } opisujących problemy
 * - columns: lista nazw kolumn
 *
 * Błędne wiersze są pomijane; poprawne wiersze trafiają do transakcji mimo błędów w innych.
 */
export function parseTransactions(csvText) {
  // Wczesne wykrycie złego separatora: jeśli pierwsza linia nie zawiera średnika,
  // ale zawiera przecinki — prawdopodobnie plik używa przecinka zamiast średnika.
  const firstLine = csvText.split('\n')[0] ?? ''
  if (!firstLine.includes(';') && firstLine.includes(',')) {
    return {
      transactions: [],
      errors: [{
        line: 1,
        field: 'separator',
        message: 'Plik prawdopodobnie używa przecinka jako separatora. Aplikacja wymaga średnika (;).',
      }],
      columns: COLUMNS,
    }
  }

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

    // --- Sprawdzenie daty ---
    if (!row.date || !isValidDate(row.date)) {
      errors.push({
        line: lineNumber,
        field: 'date',
        message: `Wiersz ${lineNumber}: nieprawidłowa data "${row.date}" — wymagany format: RRRR-MM-DD GG:MM:SS (np. 2024-03-15 10:00:00).`,
      })
      return
    }

    // --- Sprawdzenie tickera ---
    if (!row.ticker) {
      errors.push({
        line: lineNumber,
        field: 'ticker',
        message: `Wiersz ${lineNumber}: brak symbolu (ticker).`,
      })
      return
    }

    // --- Sprawdzenie typu aktywa ---
    if (!ASSET_TYPES.includes(row.type)) {
      errors.push({
        line: lineNumber,
        field: 'type',
        message: `Wiersz ${lineNumber}: nieznany typ aktywa "${row.type}".`,
      })
      return
    }

    // --- Sprawdzenie operacji ---
    if (!ACTIONS.includes(row.action)) {
      errors.push({
        line: lineNumber,
        field: 'action',
        message: `Wiersz ${lineNumber}: nieznana operacja "${row.action}".`,
      })
      return
    }

    // --- Sprawdzenie ilości: musi być liczbą większą od zera ---
    if (Number.isNaN(quantity)) {
      errors.push({
        line: lineNumber,
        field: 'quantity',
        message: `Wiersz ${lineNumber}: ilość nie jest liczbą ("${row.quantity}").`,
      })
      return
    }
    if (quantity <= 0) {
      errors.push({
        line: lineNumber,
        field: 'quantity',
        message: `Wiersz ${lineNumber}: ilość musi być większa od zera (podano: ${row.quantity}).`,
      })
      return
    }

    // --- Sprawdzenie ceny: musi być liczbą większą lub równą zero ---
    if (Number.isNaN(price)) {
      errors.push({
        line: lineNumber,
        field: 'price',
        message: `Wiersz ${lineNumber}: cena nie jest liczbą ("${row.price}").`,
      })
      return
    }
    if (price < 0) {
      errors.push({
        line: lineNumber,
        field: 'price',
        message: `Wiersz ${lineNumber}: cena nie może być ujemna (podano: ${row.price}).`,
      })
      return
    }

    // --- Sprawdzenie waluty: dokładnie trzy litery alfabetu ---
    if (!row.currency || !/^[A-Za-z]{3}$/.test(row.currency)) {
      errors.push({
        line: lineNumber,
        field: 'currency',
        message: `Wiersz ${lineNumber}: waluta "${row.currency}" musi być trzyliterowym kodem (np. USD, EUR, PLN).`,
      })
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
      currency: row.currency.toUpperCase(),
      broker: row.broker,
      comment: row.comment || '',
    })
  })

  return { transactions, errors, columns: COLUMNS }
}
