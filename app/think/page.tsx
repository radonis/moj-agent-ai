import { AgentChat } from "../components/agent-chat";

const thinkQuestions = [
  "Firma ma 120 pracowników na umowę o pracę. 40% to kobiety. Spośród kobiet 25% pracuje zdalnie. Spośród mężczyzn 15% pracuje zdalnie. Ile osób łącznie pracuje zdalnie i jaki to procent całej firmy?",
  "Mam ofertę: 12 000 zł brutto na UoP vs 15 000 zł netto na B2B. Co się bardziej opłaca?",
];

export default function ThinkPage() {
  return (
    <AgentChat
      api="/api/think"
      title="🧠 Tryb głębokiego myślenia"
      subtitle="Agent pokazuje uporządkowaną analizę krok po kroku przed finalną odpowiedzią."
      placeholder="Zadaj trudne pytanie..."
      starterQuestions={thinkQuestions}
      emptyMessage="Zadaj złożone pytanie, a agent rozłoży je na kroki."
    />
  );
}
