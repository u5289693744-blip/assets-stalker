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

## Formuły finansowe

- **2026-06-01** — Zasada walutowa potwierdzona w kodzie: obliczenia prowadzimy w USD,
  na PLN przeliczamy wyłącznie przy wyświetlaniu (widok wybrany przez użytkownika: PLN).
- **2026-06-01** — Dywidendy NIE są wpisywane do pliku CSV — mają być wyliczane na
  podstawie posiadanych aktywów (do zrobienia w kolejnym kroku).

## Naprawione błędy

_(brak wpisów)_

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