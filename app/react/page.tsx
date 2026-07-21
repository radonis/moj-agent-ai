import { AgentChat } from "../components/agent-chat";

const starterQuestions = [
  "Planuje weekend w Krakowie. Sprawdz pogode, znajdz ciekawe miejsca w Wikipedii, i powiedz czy sa jakies swieta w ten weekend",
  "Mam 5000 EUR do wydania. Przelicz na PLN, sprawdz ile to w dolarach, i zapisz wszystkie kursy w notatkach",
  "Porownaj pogode w Warszawie, Berlinie i Paryzu. Ktore z tych miast ma dzis najlepsza pogode?",
  "Ile dni do nastepnego swieta w Polsce? Jaka bedzie wtedy pogoda?",
];

const toolCatalog = [
  { label: "🧮 calculator", description: "Dokladne obliczenia i przeliczniki", active: true },
  { label: "🕒 currentDateTime", description: "Aktualna data i czas", active: true },
  { label: "🌤️ getWeather", description: "Pogoda z Open-Meteo", active: true },
  { label: "💱 getExchangeRate", description: "Kursy z NBP", active: true },
  { label: "🎉 getHolidays", description: "Swieta panstwowe", active: true },
  { label: "📚 searchWikipedia", description: "Streszczenia z Wikipedii", active: true },
  { label: "📝 saveNote", description: "Zapisywanie notatek", active: true },
  { label: "🗂️ getNotes", description: "Odczyt zapisanych notatek", active: true },
  { label: "📄 readWebPage", description: "Czytanie stron WWW", active: true },
  { label: "🌐 google_search", description: "Google grounding dla aktualnych danych", active: true },
];

export default function ReactPage() {
  return (
    <AgentChat
      api="/api/react"
      title="🔄 Agent ReAct - Autonomiczne rozumowanie"
      subtitle="Opisz cel -> agent sam planuje i realizuje"
      placeholder="Opisz co chcesz osiagnac..."
      starterQuestions={starterQuestions}
      emptyMessage="Wpisz cel albo kliknij scenariusz, a agent sam rozlozy zadanie na kroki."
      starterPlacement="header"
      reactMode
      toolCatalog={toolCatalog}
    />
  );
}
