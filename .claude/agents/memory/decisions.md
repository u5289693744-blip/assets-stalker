# Pamięć projektu: asset-stalker

Ten plik jest czytany przez agenta Portfolio Tracker na początku każdej rozmowy.
Zawiera kluczowe decyzje podjęte podczas budowania aplikacji.

---

## API i źródła danych

- **2026-06-01** — Wybrane (planowane, jeszcze niepodłączone) darmowe źródła danych,
  bez kluczy płatnych i subskrypcji:
  - **CoinGecko** — ceny kryptowalut (BTC, ETH, SOL...).
  - **Stooq** — ceny akcji, ETF-ów i polskich obligacji skarbowych.
  - **Frankfurter / Europejski Bank Centralny** — kursy walut do przeliczeń.
  - Uzasadnienie: najtrudniejsze do zdobycia za darmo są ceny akcji/ETF-ów;
    Stooq pokrywa rynek USA i polski (w tym obligacje), CoinGecko działa bez klucza.

- **2026-06-01** — Podłączone i działające źródła cen (zaimplementowane):
  - **CoinGecko** (`src/lib/prices/fetchPrices.js`) — endpoint
    `https://api.coingecko.com/api/v3/simple/price?ids=<id>&vs_currencies=usd`.
    Mapa: BTC→bitcoin, ETH→ethereum, SOL→solana. CORS ok, jeden request dla wszystkich.
  - **Stooq przez proxy Vite** — Stooq nie wysyła nagłówków CORS, więc bezpośredni
    fetch z przeglądarki jest blokowany. Rozwiązanie: `vite.config.js` proxy
    `/api/stooq` → `https://stooq.com` (changeOrigin: true). Działa tylko pod
    `npm run dev` (serwer deweloperski). Symbole: akcje USA → `<ticker>.us` (USD),
    ETF-y europejskie → `vwce.de`, `eunl.de`, `sxr8.de` (EUR, przeliczane na USD).
  - **Frankfurter** (`https://api.frankfurter.dev/v1/latest?base=USD&symbols=PLN,EUR`)
    — bieżące kursy EBC, CORS ok. Używamy do przeliczenia EUR→USD (obliczenia)
    i USD→PLN (wyświetlanie).
  - **Obligacje (bond), gotówka (cash)** — brak publicznego cennika, celowo
    zwracamy null (traktujemy jako "nieudane" w pasku postępu).

## Formuły finansowe

- **2026-06-01** — Zasada walutowa potwierdzona w kodzie: obliczenia prowadzimy w USD,
  na PLN przeliczamy wyłącznie przy wyświetlaniu (widok wybrany przez użytkownika: PLN).
- **2026-06-01** — Dywidendy NIE są wpisywane do pliku CSV — mają być wyliczane na
  podstawie posiadanych aktywów (do zrobienia w kolejnym kroku).
- **2026-06-01** — Koszt pozycji = średni koszt posiadanych jednostek (nie wszystkich
  zakupionych). heldQty = Σbuy − Σsell. avgCostUSD = Σ(koszt_zakupu_USD) / Σbuy.qty.
  costBasisUSD = avgCostUSD × heldQty. Pozycje z heldQty ≤ 1e-9 są ukryte.
- **2026-06-01** — Kolumna "Cena zakupu" (min–max) wyświetlana w walucie natywnej
  transakcji (np. USD dla akcji US, EUR dla ETF-ów DE), bez przeliczania na PLN —
  bo to literalnie cena jaką zapłacił użytkownik.
- **2026-06-01** — Udział w portfelu (%) = currentValueUSD pozycji / suma
  currentValueUSD wszystkich pozycji z ceną × 100. Pozycje bez ceny → „—", nie wliczane.
- **2026-06-01** — Waluta wyświetlania = PLN. Przeliczenie USD→PLN po bieżącym
  kursie Frankfurter/EBC (nie historycznym), wyłącznie w komponentach React.
- **2026-06-03** — Panel podsumowania (SummaryPanel): 5 liczb w USD, wyświetlane w PLN.
  Wzory (wszystkie obliczone w buildPortfolio, tylko pozycje z currentValueUSD !== null):
  1. Łączna wartość = totalPortfolioValueUSD (ta sama zmienna co w PortfolioTable).
  2. Zainwestowane = Σ costBasisUSD pozycji z ceną.
  3. Zmiana dzisiaj = Σ (currentPriceUSD − openPriceUSD) × heldQty (gdy open znane).
  4. Zysk/strata = Σ pnlUSD = wartość − zainwestowane (niezmiennik: różnica jest spójna).
  5. CAGR = (totalPortfolioValueUSD / totalInvestedUSD)^(1/lata) − 1,
     lata = (dziś − najwcześniejsza data zakupu pozycji z ceną) / 365.25.
     Jeśli lata < 0.1 lub totalInvestedUSD ≤ 0 → null (wyświetlane jako „—").
- **2026-06-03** — Dzienna zmiana ceny (openPriceUSD):
  - Akcje/ETF Stooq: kolumna Open (indeks 3) z tego samego CSV co Close (indeks 6).
    ETF europejskie (.de): openNative * eurToUsd. Akcje US (.us): openNative.
  - Krypto CoinGecko: dodano &include_24hr_change=true.
    openPriceUSD = price / (1 + usd_24h_change / 100). To przybliżenie z 24h temu,
    nie literalna cena sesji — odpowiednie dla krypto, które nie ma „otwarcia rynku".
  - fetchAllPrices przekazuje teraz dwie mapy: onDone(pricesUSD, openPricesUSD).
  - buildPortfolio przyjmuje openPricesUSD jako 4. argument (today przesunięte na 5.).

## Naprawione błędy

_(brak wpisów)_

## Tymczasowe wykluczenia i planowane rozszerzenia

- **2026-06-03** — Obligacje (bond) i gotówka (cash) są wykluczone z sum panelu
  podsumowania (Łączna wartość, Zainwestowane, Zysk/strata, Zmiana dzisiaj, CAGR).
  Powodem jest brak publicznego cennika i niemożność obliczenia wartości rynkowej.
  Wycena obligacji (naliczone odsetki kuponowe) zostanie dodana w przyszłości
  po stronie aplikacji (bez zewnętrznego API). Do czasu implementacji: wartość obligacji
  i gotówki nie jest wliczana do żadnej sumy panelu — jest to świadoma decyzja, nie błąd.

## Decyzje architektoniczne

- **2026-06-01** — Stos technologiczny: **Vite + React** (darmowe, otwarte narzędzia),
  aplikacja działa wyłącznie w przeglądarce, bez serwera i bazy danych.
- **2026-06-01** — Wczytywanie CSV biblioteką **PapaParse** (separator średnik, nagłówek
  w pierwszym wierszu). Parser zwraca też listę pominiętych wierszy z czytelnymi błędami.
- **2026-06-01** — Struktura folderów pod kolejne etapy: `src/lib/parsing` (czytanie CSV),
  `src/lib/portfolio` (obliczenia w USD), `src/lib/prices` (darmowe ceny i kursy),
  `src/components` (interfejs).
- **2026-06-01** — Pierwszy widok (MVP): wczytanie przykładowego pliku
  `public/sample-transactions.csv` i pokazanie transakcji w tabeli. Wartości bieżące,
  zyski/straty i wykresy — w kolejnych krokach.
- **2026-06-01** — Obejście CORS dla Stooq: proxy w `vite.config.js` (server.proxy).
  Działa tylko pod `npm run dev`. Przy budowaniu produkcyjnym (`npm run build`) serwer
  proxy nie istnieje — konieczny byłby własny backend lub CDN. Akceptowalne dla MVP
  działającego lokalnie.
- **2026-06-01** — Pobieranie cen: każdy fetch owinięty w try/catch; brak ceny → null,
  nie crash. Fetche równoległe (Promise.all), postęp aktualizowany na żywo.
  FX pobierany przed akcjami/ETF-ami (potrzebny do EUR→USD). Krypto pobierane
  jednym requestem zbiorczym (CoinGecko obsługuje listę ids).
- **2026-06-01** — Widok portfela: sekcje brokerów domyślnie zwinięte (useState false),
  zwijane/rozwijane kliknięciem. Stan rozwinięcia lokalny w komponencie BrokerSection.
  Tabela renderuje się nawet gdy wszystkie ceny zawiodą (pokazuje „—").

## Niezmienniki finansowe (krytyczne — nie łamać)

- **2026-06-03** — Trzy niezmienniki spójności portfela, które muszą zachodzić zawsze:
  1. Łączna wartość panelu (`portfolio-total`) = `totalPortfolioValueUSD` z `buildPortfolio`.
     Jest to suma `currentValueUSD` wszystkich pozycji z ceną, po wszystkich brokerach.
  2. Zysk/strata całego portfela = suma `broker.totalPnlUSD` po wszystkich brokerach.
     Każde `totalPnlUSD` brokera = suma `pnlUSD` jego pozycji z ceną.
  3. Dla każdej pozycji: `pnlUSD = currentValueUSD − costBasisUSD`
     (wartość dziś minus zainwestowane = zysk/strata). Znak +  = zysk, znak − = strata.
  Potwierdzono, że kod w `buildPortfolio.js` i `PortfolioTable.jsx` spełnia te warunki.
  `PortfolioTable` wyświetla `totalPortfolioValueUSD` bezpośrednio (bez ponownego sumowania).