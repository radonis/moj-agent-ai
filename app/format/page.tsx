import { AgentChat } from "../components/agent-chat";

const formatCommands = [
  "/tabela jezyki programowania 2026",
  "/porownanie ChatGPT vs Claude",
  "/lista 5 krokow do pierwszego agenta AI",
  "/faq sztuczna inteligencja dla poczatkujacych",
  "/email podziekowanie za udana rekrutacje",
];

export default function FormatPage() {
  return (
    <AgentChat
      api="/api/format"
      title="📐 Formatowanie"
      subtitle="Agent odpowiada w tabeli, liscie, porownaniu — na zadanie"
      placeholder="Wpisz komende, np. /tabela narzedzia AI dla marketingu"
      starterQuestions={formatCommands}
      emptyMessage="Kliknij komende, edytuj ja w polu i wyslij, aby zobaczyc odpowiedz z formatowaniem."
      starterAction="fill"
      starterPlacement="input"
    />
  );
}
