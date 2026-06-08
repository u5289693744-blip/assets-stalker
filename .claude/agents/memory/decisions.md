# Pamięć projektu: asset-stalker

Ten plik jest czytany przez agenta Portfolio Tracker na początku każdej rozmowy.
Zawiera kluczowe decyzje podjęte podczas budowania aplikacji.

---

## API i źródła danych

- **2026-06-03 — STAN AKTUALNY (zastępuje wcześniejsze wpisy o Stooq/CoinGecko poniżej).**
  Skonsolidowano wszystkie ceny aktywów na **Yahoo Finance**; Stooq i CoinGecko usunięte.
  - **Yahoo Finance** — jedyne źródło cen akcji, ETF-ów i krypto: bieżące, otwarcie dnia,
    historia miesięczna i dywidendy. Przez proxy Vite `/api/yahoo` → `https://query1.finance.yahoo.com`
    (Yahoo nie wysyła CORS; proxy działa tylko pod `npm run dev`). Endpoint `/v8/finance/chart/<symbol>`:
    bieżące = `interval=1d&range=5d` (regularMarketPrice + Open ostatniej świecy),
    historia = `interval=1mo`. Symbole: akcje USA → ticker; ETF-y EU → `<TICKER>.DE` (EUR→USD
    bieżącym kursem); krypto → `<TICKER>-USD`. Pliki: `fetchPrices.js`,
    `history/fetchHistoricalPrices.js`, `dividends/fetchDividends.js`.
  - **Frankfurter / EBC** — bez zmian, kursy walut (CORS ok, wołane bezpośrednio).
  - **Dlaczego porzucono Stooq i CoinGecko:** Stooq zablokował darmową historię (wymaga klucza
    API). CoinGecko (darmowe) ogranicza historię do 365 dni — za mało dla wieloletniego portfela,
    a dzielenie krypto na dwa źródła (CoinGecko ≤365 dni + Yahoo starsze) nie miało sensu.
    Yahoo obsługuje wszystkie aktywa jednym API — jedno spójne źródło. Ryzyko: Yahoo jest
    nieoficjalne (wewnętrzny endpoint strony), brak danych obsłużony łagodnie (null → „—").
  - **UWAGA:** zmiana proxy w `vite.config.js` wymaga RESTARTU `npm run dev` (samo odświeżenie
    przeglądarki nie przeładowuje konfiguracji proxy).

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

- **2026-06-03** — Linia „Zainwestowane" na wykresie liniowym (ValueVsInvested) nie zgadzała
  się z kartą „Zainwestowane" w panelu. Wykres `buildPortfolioHistory` doliczał koszt
  obligacji (EDO, COI ~9 000 zł), których panel nie liczy (brak ceny), oraz liczył koszt
  Bitcoina przez uśrednienie zbiorcze (BTC u dwóch brokerów), inaczej niż panel (per broker).
  Różnica ≈ 2455 USD. **Naprawa:** dodano `PRICEABLE_TYPES = {stock, etf, crypto}` — linia
  zainwestowanego pomija obligacje/gotówkę we wszystkich miesiącach; w bieżącym miesiącu
  zainwestowane jest pinowane do `cur.costBasisUSD` (zagregowany koszt z pozycji panelu),
  więc ostatni punkt = `totalInvestedUSD` z panelu co do grosza. Zweryfikowane skryptem
  (różnice wartości/zainwestowanego ~0).

- **2026-06-03** — Wykres „Skład portfela w czasie" pokazywał płaskie zero dla całej historii
  (2023–2025), realne dane tylko w bieżącym miesiącu. Przyczyna: **Stooq zablokował darmowe
  ceny historyczne** — endpoint `/q/d/l/?s=...&i=d` wymaga teraz klucza API i zamiast CSV
  zwraca instrukcję „Get your apikey". `fetchHistoricalPrices` parsował to jako brak danych →
  puste mapy → wszystkie miesiące 0%. (Bieżące ceny Stooq `/q/l/` nadal działają bez klucza.)
  **Naprawa:** przepisano `fetchHistoricalPrices.js` na **Yahoo Finance** `/v8/finance/chart`
  (przez istniejące proxy `/api/yahoo`), interwał `1mo`. Symbole: akcje USA bez zmian,
  ETF-y EU → `<TICKER>.DE` (EUR→USD bieżącym kursem), krypto → `<TICKER>-USD`. Kształt danych
  bez zmian (Map<ticker, Map<data, USD>>), więc buildPortfolioHistory działa bez modyfikacji.
  Zweryfikowane: 42/42 miesiące mają realne wartości, podział zmienia się historycznie.

- **2026-06-03** — Wykresy działały w Chrome, ale NIE w Firefoksie (pusta historia w obu
  trybach, też incognito). Przyczyna: pośrednik Vite przekazywał do Yahoo nagłówek
  `User-Agent` przeglądarki, a Yahoo **odrzuca (HTTP 429)** zapytania z podpisem Firefoksa,
  natomiast z podpisem Chrome zwraca 200. Test A/B przez proxy: Firefox-UA → 429,
  Chrome-UA → 200. **Naprawa:** w `vite.config.js` proxy `/api/yahoo` ma teraz hook
  `configure` → `proxyReq.setHeader('User-Agent', <staly Chrome UA>)`, więc Yahoo zawsze
  dostaje akceptowany podpis niezależnie od przeglądarki użytkownika. Zmiana proxy wymaga
  RESTARTU `npm run dev`.

- **2026-06-08** — Weryfikacja ceny transakcji NVDA pokazywała fałszywą czerwoną kropkę.
  Przyczyna: `fetchTransactionPrices.js` pobierało dzienne świece (i zdarzenia splitów)
  tylko w oknie od pierwszej do ostatniej transakcji danego aktywa. Yahoo zwraca splity
  WYŁĄCZNIE z okresu zapytania, a split NVDA 10:1 nastąpił 2024-06-10 — PO ostatniej
  transakcji NVDA (2024-02-06). Skutek: `events.splits` puste → `splitFactor = 1` → brak
  korekty → porównanie 230,10 USD (wpisane) z ~23 USD (skorygowane przez Yahoo) → czerwona.
  Potwierdzone zapytaniami do API: okno do 2024-02 → 0 splitów; okno do dziś → split 10:1.
  **Naprawa:** `maxUnix` rozszerzone z „ostatnia transakcja + 5 dni" do „dziś"
  (`Math.floor(Date.now() / 1000)`), więc okno zawsze obejmuje wszystkie późniejsze splity.
  Dodatkowe świece są nieszkodliwe (findNearestCandle dopasowuje tylko świece blisko daty
  transakcji). Zweryfikowano: NVDA 2023-03-02 świeca ×10 ≈ 224–234 USD → 230,10 mieści się
  → zielona. Wykryte przez skilla debug-ticker przed udostępnieniem funkcji.

---

## Wykresy — implementacja (2026-06-03)

### Nowe źródła danych

- **Stooq historyczny** — endpoint `/api/stooq/q/d/l/?s=<symbol>&i=d` → CSV z kolumnami
  Date,Open,High,Low,Close,Volume (dzienny interwał). Parsujemy Close (indeks 4 w tym
  endpoincie — uwaga: inny format niż endpoint bieżący `q/l/`). Symbole i przeliczenie
  EUR→USD identyczne jak dla bieżących cen.
- **CoinGecko market_chart** — `coins/<id>/market_chart?vs_currency=usd&days=max` →
  `prices: [[ms, usd], ...]`. Ceny bezpośrednio w USD. Używamy do historii krypto.
- **Yahoo Finance dywidendy** — przez nowe proxy `/api/yahoo` → `https://query1.finance.yahoo.com`.
  Endpoint: `/v8/finance/chart/<symbol>?period1=0&period2=9999999999&interval=1d&events=div`.
  Odpowiedź: `chart.result[0].events.dividends = { <ts>: { amount, date } }`.
  Symbole: akcje US → `<TICKER>` (np. AAPL), ETF-y europejskie → `<TICKER>.DE` (np. VWCE.DE).
  Dywidenda na akcję w walucie waloru; przeliczamy na USD bieżącym FX.

### Formuły rekonstrukcji historycznej

- **Oś czasu**: miesiące od miesiąca pierwszej transakcji buy/sell do bieżącego miesiąca.
- **heldQty(ticker, M)**: Σ buy.qty − Σ sell.qty dla transakcji z datą ≤ koniec miesiąca M.
- **avgCostUSD(ticker, M)**: Σ(cena_buy_USD × qty) / Σ qty dla transakcji buy ≤ M.
  Przeliczenie na USD: bieżący kurs FX (identycznie jak buildPortfolio).
- **investedUSD(ticker, M)**: avgCostUSD × heldQty(M) — ile gotówki tkwi w tej pozycji.
- **valueUSD(ticker, M)**: heldQty(M) × cena_historyczna_USD z dziennej mapy (forward-fill:
  ostatni dostępny dzień ≤ koniec miesiąca). Dla bieżącego miesiąca → patrz pinowanie niżej.
- **Formuła dywidend**: amount(na akcję) × heldQty(ticker, data_ex_dividend) → USD → opcjonalnie PLN.
  heldQty na dzień ex-dividend = stan posiadania na podstawie transakcji buy/sell do tej daty.

### Pinowanie punktu "dziś" — krytyczna zasada spójności

- Ostatni punkt osi czasu (bieżący miesiąc) NIE używa historycznych cen z Stooq/CoinGecko.
  Zamiast tego bierze `currentValueUSD` i `costBasisUSD` wprost z `buildPortfolio` (po pozycjach).
- Dzięki temu:
  - Suma wykresu kołowego (AllocationPie) = `totalPortfolioValueUSD` z panelu.
  - Ostatni punkt linii "Aktualna wartość" (ValueVsInvested) = `totalPortfolioValueUSD`.
  - Ostatni punkt linii "Zainwestowane" (ValueVsInvested) = `totalInvestedUSD`.
- Implementacja w `buildPortfolioHistory`: dla `isCurrentMonth === true` używamy
  `currentPositions` (Map zbudowana z `portfolio.brokers`), nie cen historycznych.

### Nowe komponenty i moduły

- `src/lib/history/fetchHistoricalPrices.js` — pobiera dzienne mapy cen dla wszystkich tickerów.
- `src/lib/history/buildPortfolioHistory.js` — rekonstruuje portfel miesiąc po miesiącu.
- `src/lib/history/fetchDividends.js` — pobiera i przetwarza dywidendy z Yahoo Finance.
- `src/components/charts/AllocationPie.jsx` — wykres kołowy (bieżący skład).
- `src/components/charts/AllocationAreaOverTime.jsx` — warstwowy obszarowy 100% z przyciskami zakresu.
- `src/components/charts/ValueVsInvested.jsx` — dwie linie: wartość vs zainwestowane.
- `src/components/charts/DividendsBar.jsx` — słupki dywidend rok po roku.
- `src/components/ChartsSection.jsx` — układ pionowy wszystkich czterech wykresów.

### Proxy Yahoo

- Dodano do `vite.config.js`: `/api/yahoo` → `https://query1.finance.yahoo.com`
  (changeOrigin: true, secure: false, rewrite usuwa prefix `/api/yahoo`).
- Analogicznie jak Stooq — działa tylko pod `npm run dev`.

### Biblioteka Recharts

- Zainstalowana: `npm install recharts` (40 pakietów, ~602 kB po minifikacji —
  ostrzeżenie o rozmiarze chunka jest oczekiwane, nie jest błędem).
- Używana we wszystkich czterech komponentach wykresów.

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

## Waluta wyświetlania (2026-06-08)

- Waluta wyświetlania jest przełączalna: PLN / USD / EUR. Domyślnie PLN (zachowanie historyczne).
- Wybór zapamiętywany w `localStorage` pod kluczem `asset-stalker.currency`.
- Menu `<select>` znajduje się w sekcji `.controls` w `App.jsx`, tuż pod przyciskami wczytywania pliku.
- Stan `displayCurrency` oraz przeliczony kurs `fxRate` (USD→waluta) przechowywane w `App.jsx`.
- Obliczenia kursów:
  - PLN: `fx.usdToPln`
  - USD: `1`
  - EUR: `1 / fx.eurToUsd` (bo `eurToUsd` to ile USD kosztuje 1 EUR, więc odwrotność = ile EUR za 1 USD)
  - Gdy kurs niedostępny (null) → `fxRate = null` → komponenty wyświetlają „—"
- Zasada walutowa niezmieniona: obliczenia wewnętrzne zawsze w USD; przeliczenie wyłącznie przy wyświetlaniu.
- Do komponentów przekazywana para `rate` (kurs USD→waluta) + `currency` (kod waluty) zamiast dawnego `usdToPln`.
- Zmienione pliki: `App.jsx`, `SummaryPanel.jsx`, `PortfolioTable.jsx`, `ChartsSection.jsx`,
  `AllocationPie.jsx`, `ValueVsInvested.jsx`, `DividendsBar.jsx`, `index.css`.
- Wyjątek: kolumna „Cena zakupu" w `PortfolioTable` nadal pokazuje walutę natywną transakcji — celowa decyzja.
- Wykres `AllocationAreaOverTime` bez zmian — operuje wyłącznie na procentach.

## Obszar wczytywania CSV — rozbudowa (2026-06-08)

- **Kształt błędów parsera:** `parseTransactions` zwraca teraz błędy jako obiekty
  `{ line, field, message }` zamiast prostych stringów. Pole `field` to klucz
  (np. `date`, `ticker`, `quantity`) używany przez `App.jsx` do grupowania.
  Wyjątek: błąd złego separatora ma `field: 'separator'` i `line: 1`.
- **Nowe reguły walidacji w parseTransactions:**
  - `date`: wzorzec `RRRR-MM-DD GG:MM:SS` + sprawdzenie sensowności daty.
  - `quantity`: musi być > 0 (poprzednio akceptowano 0 i ujemne).
  - `price`: musi być >= 0 (poprzednio akceptowano ujemne).
  - `currency`: dokładnie trzy litery alfabetu.
  - Wczesne wykrycie złego separatora: jeśli pierwsza linia nie ma `;` ale ma `,`
    → zwracany jest błąd separatora zanim PapaParse spróbuje parsować.
- **FileLoader — sygnatura zmieniona:** prop `onFileText(text)` zastąpiony przez
  `onFile(text, fileName)`. App.jsx używa `fileName` jako etykiety źródła
  (zamiast stałego „własny plik"). Dla przykładu nadal etykieta stała.
- **FileLoader — drag & drop:** obszar `.file-loader` reaguje na zdarzenia
  dragenter/dragover/dragleave/drop. Klasa `.dragover` podświetla obszar podczas
  przeciągania. preventDefault na dragover konieczny do działania drop.
- **FileLoader — walidacja pliku przed parsowaniem:**
  - odrzuca pliki bez rozszerzenia `.csv`,
  - odrzuca puste pliki (file.size === 0),
  - błąd wyświetlany w `.file-error` (pasek przy obszarze, bez zmiany sekcji errors).
- **Pogrupowane błędy w App.jsx:** komponent `ErrorGroups` grupuje obiekty błędów
  po polu i wyświetla: „Rodzaj błędu — N wierszy (5, 8, 12)". Nagłówek
  „Wiersze pominięte (N)" zachowany. Błąd separatora wyświetlany oddzielnie.

## Historia dywidend w tabeli portfela (2026-06-08)

- **fetchAllDividends** zwraca teraz obiekt `{ byYear, byTicker }` zamiast samej tablicy.
  - `byYear` — tablica roczna (do wykresu słupkowego `DividendsBar`), bez zmian w kształcie.
  - `byTicker` — słownik `{ [ticker]: [{ dateStr, heldQty, amountPerUnitUSD, totalUSD }] }`,
    szczegółowe wypłaty per ticker do modala historii.
- `DividendsBar` zaktualizowany: odczytuje `dividends?.byYear ?? dividends` (obsługuje obie
  struktury dla bezpieczeństwa).
- `PortfolioTable` przyjmuje nowy prop `dividendsByTicker` i przekazuje go do `BrokerSection`.
  W każdym wierszu tabeli tickery z dywidendami (tickerDivs?.length > 0) mają dodatkowy
  przycisk "Dywidendy". Kliknięcie otwiera `DividendHistoryModal`.
- `DividendHistoryModal` — wyświetla wypłaty pogrupowane po miesiącu (malejąco), dla każdej
  wypłaty: data, posiadane jednostki w dniu wypłaty, kwota na jednostkę, łączna kwota.
  Zamykanie: przycisk X, kliknięcie tła, klawisz Escape. Kwoty w walucie wyświetlania
  (identycznie jak reszta tabeli: rate × USD).
- `amountPerUnitUSD` = dywidenda na jedną akcję/jednostkę w USD (już przeliczona z EUR jeśli
  dotyczy ETF-ów europejskich). `totalUSD = amountPerUnitUSD × heldQty`.
- `heldQty` w wypłacie = stan posiadania obliczony z transakcji buy/sell do dnia wypłaty
  (istniejąca funkcja `heldQtyAtDate`). Nie ma związku z obecną ilością w portfelu.
- Źródło dywidend: wyłącznie Yahoo Finance (nie CSV). Format CSV nie zawiera dywidend
  w przykładowym pliku — ta funkcja jest niezależna od formatu CSV.

## Modal historii transakcji i weryfikacja cen (2026-06-08)

- **Nowa funkcja:** przycisk „Historia" w każdym wierszu tabeli portfela otwiera modal
  z pełną listą transakcji (kupno/sprzedaż/dywidenda) dla danego aktywa u danego brokera.
  Modal posortowany chronologicznie; przy każdej transakcji kupna/sprzedaży wyświetlana
  kolorowa kropka weryfikacji ceny.

- **Endpoint weryfikacji:** Yahoo Finance `/v8/finance/chart/<SYMBOL>?period1=<unix>&period2=<unix>&interval=1d&events=split`
  (przez proxy `/api/yahoo`). Pobieramy dzienne świece dla całego zakresu dat transakcji
  danego aktywa (jednorazowo per otwarcie modala, nie per transakcja). Pole `events.splits`
  dostarcza listę splitów z datami i współczynnikami.

- **Korekta o splity akcji (kluczowa decyzja):** Yahoo zwraca ceny historyczne SKORYGOWANE
  o późniejsze splity. NVDA split 10:1 (2024-06-10): transakcje sprzed splitu wpisane po
  ~230–680 USD, Yahoo zwraca ~23–68 USD. Rozwiązanie: dla każdej transakcji mnoż ceny
  Yahoo przez `splitFactor` = iloczyn (numerator/denominator) wszystkich splitów z datą
  PÓŹNIEJSZĄ niż data transakcji. Dla transakcji NVDA z 2023 factor=10, więc świeca
  Yahoo ×10 ≈ cena oryginalna → zielona kropka zamiast fałszywej czerwonej.

- **Waluta porównania (świadomy wyjątek od zasady walutowej projektu):**
  Weryfikacja cen porównuje cenę użytkownika w walucie notowania aktywa (z `meta.currency`):
  - akcje USA i krypto: USD ↔ USD (porównanie wprost)
  - europejskie ETF-y: EUR ↔ EUR (porównanie wprost, bez przeliczania na USD)
  Wyjątek: waluta transakcji ≠ waluta notowania → szara kropka.
  To celowe odstępstwo od zasady USD-w-obliczeniach, bo dotyczy weryfikacji danych wejściowych
  (nie obliczeń portfela) i pozwala uniknąć szumu kursowego.

- **Próg tolerancji:** dwustopniowy:
  1. Cena w zakresie [low, high] dnia → zielona (realna cena śróddzienna).
  2. Poza zakresem: odchylenie od granicy ≤ 15% → zielona (prowizje, zaokrąglenia, sąsiedni dzień).
     Powyżej 15% → czerwona. Bufor 15% dobrany empirycznie — brak fałszywych alarmów
     na przykładowym pliku po korekcie splitów.

- **Szara kropka (brak danych) dla:** obligacje (EDO, COI), gotówka, metale szlachetne
  (yahooSymbol zwraca null), błąd sieci, dywidendy (nie weryfikowane), brak notowań
  w ±5 dniach od daty transakcji.

- **Architektura:** nowy plik `src/lib/history/fetchTransactionPrices.js` (logika pobierania
  i weryfikacji). Nowy komponent `src/components/TransactionHistoryModal.jsx` (modal).
  `PortfolioTable` przyjmuje nowy prop `transactions` (przekazywany z `App.jsx`).
  `BrokerSection` filtruje transakcje po ticker + broker → pokazuje dokładnie historię
  wiersza z tabeli portfela.

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