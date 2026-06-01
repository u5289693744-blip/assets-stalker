Sprawdź wczytany plik CSV pod kątem poprawności. Zweryfikuj każdy wiersz według poniższych zasad.

**Wymagane kolumny** (separator: średnik):
`date; ticker; name; type; action; quantity; price; currency; broker; comment`

**Zasady walidacji:**
- `date` — musi być w formacie `YYYY-MM-DD HH:MM:SS`
- `type` — dozwolone wartości: `stock`, `etf`, `bond`, `crypto`, `cash`, `precious_metal`
- `action` — dozwolone wartości: `buy`, `sell`, `dividend`
- `quantity` — liczba większa od zera
- `price` — liczba większa lub równa zero (dywidenda może mieć cenę 0)
- `currency` — trzyliterowy kod waluty, np. `USD`, `EUR`, `PLN`

**Jak zgłosić problemy:**
- Podaj numer wiersza i nazwę pola, które jest niepoprawne
- Wyjaśnij, co jest nie tak i jak powinno wyglądać poprawne dane
- Jeśli błędów jest wiele, pogrupuj je według rodzaju
- Zaproponuj konkretną poprawkę dla każdego problemu

Nie wprowadzaj żadnych zmian bez potwierdzenia użytkownika.