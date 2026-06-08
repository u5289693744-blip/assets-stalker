import { useEffect, useState, useRef } from 'react'
import { fetchAndVerifyPrices } from '../lib/history/fetchTransactionPrices.js'

/**
 * Modal historii transakcji dla jednego aktywa (identyfikowanego przez broker + ticker).
 *
 * Pokazuje pełną historię: kupna (buy), sprzedaże (sell) i dywidendy (dividend)
 * posortowane chronologicznie. Przy każdej transakcji kupna/sprzedaży wyświetla
 * kolorową kropkę weryfikującą cenę względem danych historycznych Yahoo Finance.
 *
 * Kolory kropek:
 *   ● zielona — cena wpisana przez użytkownika mieści się w zakresie notowań z tamtego
 *               dnia (lub w pobliżu — tolerancja 15% na zaokrąglenia i prowizje)
 *   ● czerwona — cena znacząco odbiega od notowań rynkowych (możliwa literówka w CSV)
 *   ● szara  — brak danych rynkowych (obligacje, gotówka, metale, błąd sieci, brak notowań)
 *
 * Zamknięcie: kliknięcie tła, przycisk ✕, klawisz Escape.
 */

const ACTION_LABELS = {
  buy: 'Kupno',
  sell: 'Sprzedaż',
  dividend: 'Dywidenda',
}

function fmtDate(dateStr) {
  // "YYYY-MM-DD HH:MM:SS" lub "YYYY-MM-DD" → "DD.MM.YYYY"
  const d = dateStr.slice(0, 10)
  const [y, m, day] = d.split('-')
  return `${day}.${m}.${y}`
}

function fmtQty(qty) {
  if (qty === null || qty === undefined) return '—'
  if (qty < 0.01) return qty.toLocaleString('pl-PL', { maximumSignificantDigits: 4 })
  if (qty < 1) return qty.toLocaleString('pl-PL', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
  return qty.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: qty % 1 === 0 ? 0 : 2 })
}

function fmtPrice(price, currency) {
  if (price === null || price === undefined) return '—'
  return price.toLocaleString('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' ' + currency
}

/**
 * Kolorowa kropka weryfikacji ceny.
 * status: 'green' | 'red' | 'gray' | 'loading' | null (brak weryfikacji — dywidenda)
 */
function PriceDot({ status }) {
  if (!status || status === 'none') return null

  const classMap = {
    green: 'price-dot price-dot-green',
    red: 'price-dot price-dot-red',
    gray: 'price-dot price-dot-gray',
    loading: 'price-dot price-dot-loading',
  }
  const titleMap = {
    green: 'Cena zgodna z danymi rynkowymi z tamtego dnia',
    red: 'Cena odbiega od notowań rynkowych — sprawdź, czy nie ma literówki w CSV',
    gray: 'Brak danych rynkowych do weryfikacji',
    loading: 'Sprawdzam dane historyczne…',
  }

  return (
    <span
      className={classMap[status] ?? 'price-dot price-dot-gray'}
      title={titleMap[status] ?? ''}
    />
  )
}

export default function TransactionHistoryModal({ ticker, name, type, broker, transactions, onClose }) {
  const [verificationStatus, setVerificationStatus] = useState(null) // null = ładowanie

  // Zamknięcie klawiszem Escape
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // Zablokowanie scrolla strony gdy modal jest otwarty
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // Filtruj i posortuj transakcje dla tego aktywa u tego brokera (chronologicznie)
  const filteredTx = transactions
    .filter((tx) => tx.ticker === ticker && tx.broker === broker)
    .sort((a, b) => a.date.localeCompare(b.date))

  // Pobierz weryfikację cen po otwarciu modala
  useEffect(() => {
    if (filteredTx.length === 0) {
      setVerificationStatus(new Map())
      return
    }

    let cancelled = false

    fetchAndVerifyPrices(ticker, type, filteredTx)
      .then((statusMap) => {
        if (!cancelled) setVerificationStatus(statusMap)
      })
      .catch(() => {
        if (!cancelled) setVerificationStatus(new Map())
      })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, broker])

  const isLoading = verificationStatus === null

  return (
    <div
      className="tx-modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label={`Historia transakcji: ${ticker}`}
    >
      <div className="tx-modal">
        {/* Nagłówek */}
        <div className="tx-modal-header">
          <div>
            <span className="ticker">{ticker}</span>
            <span className="position-name">{name}</span>
            <span className="tx-modal-broker">{broker}</span>
          </div>
          <button className="div-modal-close" onClick={onClose} aria-label="Zamknij">
            ✕
          </button>
        </div>

        {/* Treść */}
        <div className="tx-modal-body">
          {filteredTx.length === 0 ? (
            <p className="chart-empty">Brak transakcji dla tego aktywa u tego brokera.</p>
          ) : (
            <>
              {isLoading && (
                <p className="tx-modal-loading">
                  Pobieranie danych historycznych do weryfikacji cen…
                </p>
              )}

              <table className="tx-history-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Operacja</th>
                    <th className="num">Ilość</th>
                    <th className="num">Cena</th>
                    <th>Broker</th>
                    <th>Komentarz</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTx.map((tx, i) => {
                    const isTraded = tx.action === 'buy' || tx.action === 'sell'
                    let dotStatus = null
                    if (isTraded) {
                      dotStatus = isLoading
                        ? 'loading'
                        : (verificationStatus?.get(i) ?? 'gray')
                    }
                    const rowCls = tx.action === 'sell' ? 'row-sell' : tx.action === 'dividend' ? 'row-dividend' : ''

                    return (
                      <tr key={i} className={rowCls}>
                        <td>{fmtDate(tx.date)}</td>
                        <td>{ACTION_LABELS[tx.action] ?? tx.action}</td>
                        <td className="num">{fmtQty(tx.quantity)}</td>
                        <td className="num tx-price-cell">
                          {isTraded && <PriceDot status={dotStatus} />}
                          {fmtPrice(tx.price, tx.currency)}
                        </td>
                        <td>{tx.broker}</td>
                        <td className="tx-comment">{tx.comment || ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* Adnotacja o weryfikacji — poniżej tabeli */}
              <div className="tx-verification-note">
                <strong>Uwaga:</strong> Kolorowe kropki przy cenach to pomocnicza weryfikacja
                poprawności danych — służą wyłącznie do wychwycenia literówek i pomyłek
                przy wpisywaniu pliku CSV. <strong>Nie są poradą inwestycyjną</strong> i
                nie gwarantują, że cena jest błędna lub prawidłowa. Dane historyczne
                pochodzą z Yahoo Finance i mogą być niekompletne.
                {' '}
                <span className="price-dot price-dot-green" /> cena zgodna z notowaniami
                {' '}
                <span className="price-dot price-dot-red" /> cena podejrzana
                {' '}
                <span className="price-dot price-dot-gray" /> brak danych
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
