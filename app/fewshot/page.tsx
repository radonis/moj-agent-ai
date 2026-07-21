import { AgentChat } from "../components/agent-chat";

const glossaryTerms = [
  "Sztuczna inteligencja",
  "Agent AI",
  "Prompt",
  "Halucynacja AI",
  "RAG",
  "API",
];

export default function FewShotPage() {
  return (
    <AgentChat
      api="/api/fewshot"
      title="📚 Slownik AI"
      subtitle="Wyjasniam trudne pojecia prostym jezykiem."
      placeholder="Wpisz pojecie do wyjasnienia..."
      starterQuestions={glossaryTerms}
      emptyMessage="Wpisz pojecie albo kliknij jedno z hasel, aby wstawic je do pola."
      starterAction="fill"
      starterPlacement="input"
    />
  );
}
