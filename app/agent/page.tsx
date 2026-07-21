import { AgentChat } from "../components/agent-chat";

const starterQuestions = [
  "Ile kosztuje pakiet Premium i co zawiera?",
  "Czy moge zrezygnowac z uslugi w dowolnym momencie?",
  "Znajdz w Google co robi firma Syntelligence i wygeneruj dla nich logo",
  "Przeczytaj strone apple.com i opisz ich aktualna oferte iPhone",
  "Ile to 23% VAT z 8500 PLN? Podaj kwote brutto i netto",
];

const toolCatalog = [
  { label: "Baza wiedzy", description: "Cennik, oferta, FAQ i regulamin z Supabase", active: true },
  { label: "Kalkulator", description: "VAT, procenty, brutto i netto", active: true },
  { label: "Data i czas", description: "Aktualna data i godzina w Polsce", active: true },
  { label: "Google Search", description: "Aktualne informacje z internetu", active: true },
  { label: "Czytanie stron", description: "Czyta i streszcza strony WWW", active: true },
  { label: "Generowanie obrazow", description: "Logo, grafiki i ilustracje", active: true },
  { label: "Analiza obrazow", description: "Screenshoty, OCR i pytania o obraz", active: true },
];

export default function AgentPage() {
  return (
    <AgentChat
      api="/api/chat"
      title="Agent AI - Pelna moc"
      subtitle={`${toolCatalog.length} narzedzi • autonomiczne decyzje`}
      placeholder="Zlec zadanie agentowi..."
      starterQuestions={starterQuestions}
      emptyMessage="Kliknij scenariusz startowy albo wpisz zlozone zadanie laczace kilka narzedzi."
      visionMode
      toolCatalog={toolCatalog}
    />
  );
}
