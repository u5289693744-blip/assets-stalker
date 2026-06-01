Przeanalizuj zmiany w projekcie, wykonaj commit i wyślij je na GitHub.

1. Uruchom `git diff` i `git status`, żeby zobaczyć wszystkie zmodyfikowane pliki.

2. Na podstawie zmian napisz opis po polsku — maksymalnie dwa zdania. Opisuj co się zmieniło z perspektywy użytkownika aplikacji, nie z perspektywy kodu. Przykład dobrego opisu: "Dodano obsługę dywidend — aplikacja teraz pokazuje je osobno w historii transakcji. Poprawiono też wyświetlanie wartości portfela w walucie PLN."

3. Tytuł commitu napisz po angielsku (wymóg projektu), opis możesz napisać po polsku.

4. Dodaj wszystkie zmienione pliki do commitu i wykonaj go.

5. Wyślij commit na GitHub, żeby zmiany były tam widoczne:
   - Sprawdź, czy projekt ma skonfigurowane zdalne repozytorium: `git remote`.
   - Jeśli żadnego nie ma, nie próbuj wysyłać — poinformuj użytkownika, że projekt nie jest połączony z GitHubem, i na tym zakończ.
   - Jeśli jest, wyślij bieżącą gałąź poleceniem `git push -u origin HEAD`. To działa zarówno przy pierwszym wysłaniu (ustanawia połączenie z gałęzią na GitHubie), jak i przy kolejnych.
   - Jeśli wysyłka się nie powiedzie (np. brak dostępu albo uprawnień), pokaż użytkownikowi treść błędu prostym językiem i nie udawaj, że się udało.

6. Powiedz użytkownikowi, co zostało zapisane i czy trafiło na GitHub — jednym, najwyżej dwoma zdaniami.
