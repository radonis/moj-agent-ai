import { AgentChat } from "../components/agent-chat";

const starterQuestions = [
  "Planuje weekend w Berlinie. Budzet: 2000 PLN",
  "Lece do Paryza na tydzien w sierpniu",
  "Wycieczka do Pragi z rodzina na 3 dni",
  "Podroz sluzbowa do Londynu w przyszlym tygodniu",
  "Porownaj Barcelone i Lizbone na wakacje",
  "Lece do Neapolu. Co lokalnego zjesc i jakich restauracji szukac?",
];

const toolCatalog = [
  { label: "Pogoda", description: "Sprawdza warunki na miejscu", active: true },
  { label: "Waluta", description: "Kursy z NBP i przeliczenia budzetu", active: true },
  { label: "Swieta", description: "Dni wolne i ryzyko zamknietych atrakcji", active: true },
  { label: "Miasto", description: "Wikipedia i internet do planu zwiedzania", active: true },
  { label: "Smaki miasta", description: "Lokalne potrawy, napoje i wskazowki restauracyjne", active: true },
  { label: "Kalkulator", description: "Budzet, koszty i przeliczniki", active: true },
  { label: "Notatki", description: "Zapisywanie ustalen wyjazdu", active: true },
];

export default function TravelPage() {
  return (
    <AgentChat
      api="/api/travel"
      title="Asystent podrozy AI"
      subtitle="Powiedz dokad jedziesz - agent zaplanuje wyjazd, atrakcje i lokalne smaki"
      placeholder="Np. Lece do Barcelony na weekend..."
      starterQuestions={starterQuestions}
      emptyMessage="Opisz wyjazd albo kliknij scenariusz, a agent zbierze pogode, walute, swieta, atrakcje i lokalne smaki."
      starterPlacement="header"
      reactMode
      travelMode
      toolCatalog={toolCatalog}
    />
  );
}
