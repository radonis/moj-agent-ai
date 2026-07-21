import { AgentChat } from "../components/agent-chat";

const starterQuestions = [
  "Jakie sa najnowsze wiadomosci o sztucznej inteligencji?",
  "Ile kosztuje iPhone 16 Pro w Polsce?",
  "Kto wygral ostatni mecz reprezentacji Polski?",
  "Jakie filmy sa teraz w kinach?",
];

export default function SearchPage() {
  return (
    <AgentChat
      api="/api/chat"
      title="🌐 Agent z wyszukiwarka"
      subtitle="Przeszukuje prawdziwy internet i czyta strony."
      placeholder="Zapytaj o cokolwiek aktualnego..."
      starterQuestions={starterQuestions}
      emptyMessage="Zapytaj o biezace wydarzenia, ceny, wyniki albo wklej adres strony do przeczytania."
    />
  );
}
