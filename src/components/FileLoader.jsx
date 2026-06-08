import { useState, useRef } from 'react'

// Pozwala wczytać własny plik CSV z dysku albo załadować przykład dołączony do aplikacji.
// Obsługuje: kliknięcie, przeciąganie pliku (drag & drop), walidację formatu i rozmiaru.
export default function FileLoader({ onFile, onLoadSample }) {
  // Stan przeciągania — aktywny gdy użytkownik trzyma plik nad obszarem.
  const [dragOver, setDragOver] = useState(false)
  // Komunikat o błędzie wczytywania (np. zły format pliku, pusty plik).
  const [fileError, setFileError] = useState(null)

  const inputRef = useRef(null)

  // Sprawdza i wczytuje plik; jeśli coś jest nie tak — ustawia komunikat błędu.
  function processFile(file) {
    setFileError(null)

    if (!file) return

    // Odrzuć pliki, które nie są CSV (rozszerzenie ani typ MIME nie pasują).
    const hasCorrectExtension = file.name.toLowerCase().endsWith('.csv')
    const hasCorrectMime = file.type === 'text/csv' || file.type === 'application/vnd.ms-excel' || file.type === ''
    if (!hasCorrectExtension) {
      setFileError(`Plik "${file.name}" nie jest plikiem CSV. Wybierz plik z rozszerzeniem .csv.`)
      return
    }

    // Odrzuć puste pliki.
    if (file.size === 0) {
      setFileError(`Plik "${file.name}" jest pusty. Wybierz plik zawierający transakcje.`)
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result)
      // Przekaż tekst i nazwę pliku do App.jsx.
      onFile(text, file.name)
    }
    reader.readAsText(file, 'utf-8')
  }

  // Obsługa wyboru pliku przez okno systemowe.
  function handleInputChange(event) {
    processFile(event.target.files?.[0])
    // Zresetuj input, żeby można było ponownie wybrać ten sam plik.
    if (inputRef.current) inputRef.current.value = ''
  }

  // Wejście kursora z plikiem nad obszarem — podświetl obszar.
  function handleDragEnter(e) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }

  // Ruch nad obszarem — preventDefault jest konieczny, żeby drop zadziałał.
  function handleDragOver(e) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }

  // Wyjście kursora z plikiem poza obszar — usuń podświetlenie.
  function handleDragLeave(e) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }

  // Upuszczenie pliku na obszar.
  function handleDrop(e) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    processFile(file)
  }

  return (
    <div className="file-loader-wrapper">
      {/* Obszar przeciągania — zawiera przyciski i opis strefy drop */}
      <div
        className={`file-loader${dragOver ? ' dragover' : ''}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <label className="button">
          Wczytaj własny plik CSV
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleInputChange}
            hidden
          />
        </label>
        <button className="button secondary" onClick={onLoadSample}>
          Załaduj przykład
        </button>
        <span className="file-drop-hint">lub przeciągnij plik tutaj</span>
      </div>

      {/* Komunikat o błędzie wczytywania pliku */}
      {fileError && (
        <p className="file-error">{fileError}</p>
      )}
    </div>
  )
}
