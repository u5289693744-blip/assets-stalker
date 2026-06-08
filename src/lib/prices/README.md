# Folder: prices

Pobieranie aktualnych cen aktywów i kursów walut — wyłącznie ze źródeł
**darmowych**, bez kluczy płatnych ani subskrypcji.

Źródła używane w aplikacji:
- **Yahoo Finance** (`fetchPrices.js`, `../history/fetchHistoricalPrices.js`,
  `../dividends/fetchDividends.js`) — ceny akcji, ETF-ów i kryptowalut: bieżące,
  cena otwarcia dnia, historia miesięczna oraz dywidendy. Jedno spójne źródło dla
  wszystkich rodzajów aktywów, wołane przez proxy `/api/yahoo` (Yahoo nie wysyła
  nagłówków CORS).
- **Frankfurter / Europejski Bank Centralny** — kursy walut do przeliczeń
  (USD jest walutą bazową obliczeń, PLN/EUR służą do wyświetlania).

Symbole Yahoo: akcje USA — ticker bez zmian; europejskie ETF-y — `<TICKER>.DE`
(w EUR, przeliczane na USD); krypto — `<TICKER>-USD`.

Dlaczego nie Stooq / CoinGecko:
- **Stooq** przestał udostępniać darmowe dane historyczne (endpoint dzienny wymaga
  teraz klucza API).
- **CoinGecko** (darmowe) ogranicza historię do 365 dni — za mało dla wieloletniego
  portfela, a dzielenie krypto na dwa źródła nie miałoby sensu.

Obligacje, gotówka i metale szlachetne nie mają publicznego cennika → cena `null`.
Dywidendy są pobierane z Yahoo (wypłata na akcję × liczba posiadanych jednostek
w dniu wypłaty).
