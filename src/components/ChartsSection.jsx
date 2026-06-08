/**
 * ChartsSection — sekcja z czterema wykresami portfela.
 *
 * Wykresy są ułożone jeden pod drugim i wyświetlane tylko gdy jest załadowany portfel.
 * Każdy wykres ma nagłówek i krótkie wyjaśnienie prostym językiem.
 *
 * Kolejność:
 *   1. Wykres kołowy — bieżący podział portfela
 *   2. Wykres warstwowy — jak zmieniał się skład portfela w czasie
 *   3. Wykres liniowy — wartość vs zainwestowane w czasie
 *   4. Wykres słupkowy — dywidendy rok po roku
 */
import AllocationPie from './charts/AllocationPie.jsx'
import AllocationAreaOverTime from './charts/AllocationAreaOverTime.jsx'
import ValueVsInvested from './charts/ValueVsInvested.jsx'
import DividendsBar from './charts/DividendsBar.jsx'

export default function ChartsSection({
  portfolio,
  rate,
  currency,
  history,
  historyLoading,
  dividends,
  dividendsLoading,
}) {
  if (!portfolio) return null

  return (
    <section className="charts-section">
      {/* Wykres 1 — podział portfela w tej chwili */}
      <div className="chart-block">
        <h3 className="chart-title">Skład portfela (teraz)</h3>
        <p className="chart-desc">
          Jak Twoje pieniądze są podzielone między różne rodzaje aktywów — akcje, ETF-y,
          kryptowaluty i inne. Procenty są wyliczone na podstawie bieżących cen rynkowych.
          Obligacje i gotówka nie mają ceny rynkowej, więc nie są uwzględnione.
        </p>
        <AllocationPie portfolio={portfolio} rate={rate} currency={currency} />
      </div>

      {/* Wykres 2 — jak zmieniał się skład w czasie */}
      <div className="chart-block">
        <h3 className="chart-title">Skład portfela w czasie</h3>
        <p className="chart-desc">
          Jak zmieniał się procentowy udział poszczególnych rodzajów aktywów miesiąc po
          miesiącu. Suma wszystkich warstw w danym miesiącu zawsze wynosi 100%.
          Użyj przycisków, aby zawęzić zakres czasu.
        </p>
        <AllocationAreaOverTime history={history} loading={historyLoading} />
      </div>

      {/* Wykres 3 — wartość portfela vs zainwestowane */}
      <div className="chart-block">
        <h3 className="chart-title">Wartość portfela vs zainwestowane</h3>
        <p className="chart-desc">
          Zielona linia to ile Twój portfel jest wart dziś (po bieżących cenach), niebieska
          linia to ile gotówki do niego włożyłeś. Gdy zielona jest powyżej niebieskiej —
          jesteś na plusie. Ostatni punkt obu linii odpowiada dokładnie wartościom
          z panelu podsumowania powyżej.
        </p>
        <ValueVsInvested history={history} rate={rate} currency={currency} loading={historyLoading} />
      </div>

      {/* Wykres 4 — dywidendy */}
      <div className="chart-block">
        <h3 className="chart-title">Dywidendy rok po roku</h3>
        <p className="chart-desc">
          Ile dywidend (wypłat z zysku przez spółki) otrzymałeś w każdym roku —
          proporcjonalnie do tego, ile akcji posiadałeś w dniu wypłaty.
          Dane pobierane z Yahoo Finance. Kryptowaluty, obligacje i gotówka nie
          wypłacają dywidend w tym sensie.
          Uwaga: wycena obligacji (odsetki kuponowe) zostanie dodana w przyszłości.
        </p>
        <DividendsBar dividends={dividends} rate={rate} currency={currency} loading={dividendsLoading} />
      </div>
    </section>
  )
}
