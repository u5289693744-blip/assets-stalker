# asset-stalker

Przegladarkowy tracker portfela inwestycyjnego. Wczytujesz plik CSV z historia
transakcji i widzisz swoj portfel. Wszystko dziala lokalnie w przegladarce —
bez serwera, bez bazy danych, bez platnych API.

## Jak uruchomic

Potrzebujesz zainstalowanego Node.js (sprawdzone na wersji 22).

1. Zainstaluj zaleznosci (jednorazowo):

   ```
   npm install
   ```

2. Uruchom aplikacje w trybie deweloperskim:

   ```
   npm run dev
   ```

3. Otworz w przegladarce adres, ktory pokaze sie w terminalu
   (zwykle `http://localhost:5173`).

Po otwarciu aplikacja od razu wczyta przykladowe dane z pliku
`public/sample-transactions.csv`. Mozesz tez wczytac wlasny plik CSV
przyciskiem na gorze strony.

## Format pliku CSV

Pola oddzielone srednikiem, jeden wiersz = jedna transakcja:

```
date;ticker;name;type;action;quantity;price;currency;broker;comment
```

- `type`: stock, etf, bond, crypto, cash, precious_metal
- `action`: buy, sell, dividend

## Struktura projektu

```
public/
  sample-transactions.csv   # przykladowe dane (30 transakcji)
src/
  App.jsx                   # glowny widok aplikacji
  components/               # elementy interfejsu (tabela, wczytywanie pliku)
  lib/
    parsing/                # czytanie pliku CSV
    portfolio/              # obliczenia portfela (w USD) — kolejne kroki
    prices/                 # pobieranie darmowych cen i kursow — kolejne kroki
```
