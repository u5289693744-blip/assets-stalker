# CLAUDE.md

Ten plik zawiera wskazówki dla Claude Code (claude.ai/code) dotyczące pracy w tym repozytorium.

## Projekt: asset-stalker

Aplikacja webowa działająca wyłącznie w przeglądarce. Użytkownik wczytuje plik CSV z transakcjami inwestycyjnymi i widzi swój portfel — aktualne wartości, zyski, straty oraz wykresy. Brak serwera, brak bazy danych, żadnych płatnych API.

## Format pliku CSV

Pola oddzielone średnikiem. Każdy wiersz to jedna transakcja.

```
date; ticker; name; type; action; quantity; price; currency; broker; comment
```

| Pole       | Opis                                                                        |
|------------|-----------------------------------------------------------------------------|
| date       | Data i godzina, np. `2024-03-15 10:00:00`                                  |
| ticker     | Symbol giełdowy, np. `AAPL`                                                 |
| name       | Pełna nazwa aktywa                                                          |
| type       | `stock`, `etf`, `bond`, `crypto`, `cash`, `precious_metal`                 |
| action     | `buy`, `sell`, `dividend`                                                   |
| quantity   | Liczba jednostek                                                            |
| price      | Cena za jednostkę                                                           |
| currency   | Waluta transakcji, np. `USD`, `EUR`, `PLN`                                 |
| broker     | Nazwa brokera                                                               |
| comment    | Opcjonalna notatka                                                          |

## Zasada walutowa — krytyczna

Wszystkie wewnętrzne obliczenia muszą być prowadzone w dolarach amerykańskich (USD). Na inne waluty przeliczamy wyłącznie wtedy, gdy pokazujemy wynik użytkownikowi. Nigdy nie mieszamy walut w obliczeniach.

## Jak Claude powinno zachowywać się w tym projekcie

- **Wyjaśnij, zanim zaczniesz działać:** Zawsze opisz, co zamierzasz zrobić, zanim wprowadzisz zmiany.
- **Pytaj przed dużymi zmianami:** Poproś o potwierdzenie przed istotnymi modyfikacjami.
- **Wyjaśniaj pojęcia finansowe:** Każde pojęcie finansowe wprowadzone w projekcie powinno być krótko wyjaśnione prostym językiem.
- **Pytaj, nie zgaduj:** Jeśli coś jest niejasne, zapytaj zamiast zakładać.
