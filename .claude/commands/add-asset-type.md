Przeprowadź użytkownika przez dodanie obsługi nowego rodzaju aktywa do aplikacji.

Zadaj kolejno następujące pytania i czekaj na odpowiedź przed przejściem do następnego:

1. **Nazwa i symbol** — jak nazywa się nowy rodzaj aktywa i jaki identyfikator powinien mieć w pliku CSV (np. `real_estate`)?

2. **Pobieranie ceny** — skąd aplikacja ma pobierać aktualną cenę?
   - Czy istnieje darmowe API, które to obsługuje?
   - A może cena jest stała lub wpisywana ręcznie przez użytkownika?

3. **Waluta notowania** — w jakiej walucie notowane jest to aktywo? Pamiętaj, że do obliczeń wewnętrznych zawsze przeliczamy na USD.

Po zebraniu odpowiedzi:
- Opisz plan zmian krok po kroku, bez kodu
- Wyjaśnij, które miejsca w aplikacji zostaną zaktualizowane i dlaczego (pobieranie cen, tabela portfela, wykresy)
- Poproś o potwierdzenie przed wprowadzeniem jakichkolwiek zmian
- Wprowadzaj zmiany etapami, opisując każdy krok

Po zakończeniu zaktualizuj plik `.claude/agents/memory/decisions.md` — dodaj wpis z datą opisujący dodane aktywo i wybrane podejście do pobierania ceny.
