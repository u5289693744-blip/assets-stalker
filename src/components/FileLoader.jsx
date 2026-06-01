// Pozwala wczytać własny plik CSV z dysku albo załadować przykład dołączony do aplikacji.
export default function FileLoader({ onFileText, onLoadSample }) {
  function handleFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => onFileText(String(reader.result))
    reader.readAsText(file, 'utf-8')
  }

  return (
    <div className="file-loader">
      <label className="button">
        Wczytaj własny plik CSV
        <input type="file" accept=".csv,text/csv" onChange={handleFile} hidden />
      </label>
      <button className="button secondary" onClick={onLoadSample}>
        Załaduj przykład
      </button>
    </div>
  )
}
