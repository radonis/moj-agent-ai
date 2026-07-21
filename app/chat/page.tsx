import { AgentChat } from "../components/agent-chat";

const starterQuestions = [
  "Jaka forme opodatkowania wybrac przy JDG w IT?",
  "Czy na B2B bardziej oplaca sie skala, liniowy czy ryczalt?",
  "Kiedy warto zalozyc spolke z o.o. zamiast dzialalnosci?",
  "Jakie koszty moge bezpiecznie wrzucic w firmie uslugowej?",
];

export default function ChatPage() {
  return (
    <AgentChat
      api="/api/chat"
      title="Marta - doradczyni podatkowa"
      subtitle="Ekspert od podatkow dla JDG, B2B i spolek z o.o."
      placeholder="Zapytaj o podatki, B2B, koszty, VAT lub spolke z o.o...."
      starterQuestions={starterQuestions}
      emptyMessage="Napisz pierwsza wiadomosc albo kliknij jedno z pytan startowych."
    />
  );
}
