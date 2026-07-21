import { AgentChat } from "../components/agent-chat";

const starterQuestions = [
  "Co widzisz na tym obrazie?",
  "Wyciagnij caly tekst z tego screena",
  "Opisz to w 3 zdaniach",
  "Jakie kolory dominuja? Podaj kody HEX",
  "Wygeneruj podobny obraz w innym stylu",
];

export default function VisionPage() {
  return (
    <AgentChat
      api="/api/chat"
      title="👁️ Agent Vision"
      subtitle="Wklej screenshot, wrzuc plik lub przeciagnij obraz."
      placeholder="Zadaj pytanie o obraz..."
      starterQuestions={starterQuestions}
      emptyMessage="Dodaj obraz i zapytaj, co agent ma z nim zrobic."
      starterPlacement="input"
      visionMode
    />
  );
}
