import { AgentChat } from "../components/agent-chat";

const starterQuestions = [
  "Wyciagnij najwazniejsze punkty z tego tekstu",
  "Zrob liste decyzji i action items",
  "Podsumuj tresc w 5 punktach",
  "Wyciagnij caly tekst ze screena i uporzadkuj go",
];

export default function ExtractPage() {
  return (
    <AgentChat
      api="/api/chat"
      title="📊 Analizator"
      subtitle="Wyciaga tekst, fakty, decyzje i wnioski z tresci oraz obrazow."
      placeholder="Wklej tresc albo dolacz obraz i napisz, co wyciagnac..."
      starterQuestions={starterQuestions}
      emptyMessage="Dodaj tekst lub obraz i popros o ekstrakcje najwazniejszych informacji."
      visionMode
    />
  );
}
