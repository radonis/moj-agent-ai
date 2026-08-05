import { AgentChat } from "../components/agent-chat";

export default function ChatPage() {
  return <AgentChat api="/api/chat" title="Mr. Watt — ekspert ds. rynków energetycznych" subtitle="Prognozy cen energii, regulacje prawa energetycznego i efektywność energetyczna w Polsce i UE." placeholder="Zapytaj o ceny energii, regulacje, rynek UE lub efektywność energetyczną..." starterQuestions={[]} emptyMessage="Napisz pierwszą wiadomość do Mr. Watt." />;
}
