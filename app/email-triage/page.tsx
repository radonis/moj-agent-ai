"use client";

import { FormEvent, useMemo, useState } from "react";
import { AppNav } from "../components/app-nav";

type Priority = "high" | "medium" | "low" | "spam";
type EmailCard = { number: string; subject: string; category: string; priority: Priority; reason: string; draft: string };

const exampleEmails = `Od: jan.kowalski@firma.pl
Temat: PILNE - Problem z fakturą
Treść: Dzień dobry, mam problem z fakturą FV/2026/001. Kwota jest nieprawidłowa — powinno być 5000 zł a jest 3000 zł. Proszę o PILNĄ korektę. Termin płatności mija jutro.

Od: winner@lucky-prize.com
Temat: Congratulations! You won $1,000,000
Treść: Click here to claim your prize! Limited time offer. Act now!

Od: anna.nowak@partner.pl
Temat: Propozycja współpracy
Treść: Dzień dobry, reprezentuję firmę ABC Solutions. Chcielibyśmy omówić możliwość współpracy w zakresie dostarczania usług IT. Czy możemy umówić się na spotkanie w przyszłym tygodniu?

Od: klient123@gmail.com
Temat: Nie działa usługa od 3 dni
Treść: Witam, od poniedziałku nie mogę się zalogować do panelu klienta. Próbowałem resetować hasło ale nie dostaję maila. To już trzeci dzień! Jeśli nie rozwiążecie tego dziś, zrezygnuję z usługi.

Od: newsletter@branżowy-portal.pl
Temat: Nowe trendy AI w biznesie - raport 2026
Treść: Zapraszamy do lektury naszego najnowszego raportu o zastosowaniach AI w polskich firmach. Pobierz za darmo na naszej stronie.`;

function priorityFrom(value: string): Priority {
  const normalized = value.toLowerCase();
  if (normalized.includes("spam")) return "spam";
  if (normalized.includes("wysoki") || normalized.includes("🔴")) return "high";
  if (normalized.includes("średni") || normalized.includes("sredni") || normalized.includes("🟡")) return "medium";
  return "low";
}

function parseCards(text: string): EmailCard[] {
  const matches = [...text.matchAll(/###\s*Mail\s*(\d+)\s*:\s*([^\n]+)([\s\S]*?)(?=\n###\s*(?:Mail|PODSUMOWANIE)|$)/gi)];
  return matches.map((match) => {
    const block = match[3];
    const row = (name: string) => block.match(new RegExp(`\\|\\s*${name}\\s*\\|\\s*([^|\\n]+)`, "i"))?.[1]?.trim() ?? "—";
    const draft = block.match(/\*\*Proponowana odpowiedź:\*\*\s*\n?>?\s*([\s\S]*?)(?=\n---|$)/i)?.[1]
      ?.replace(/^>\s?/gm, "").trim() ?? "Draft pojawi się po zakończeniu analizy.";
    return { number: match[1], subject: match[2].trim(), category: row("Kategoria"), priority: priorityFrom(row("Priorytet")), reason: row("Uzasadnienie"), draft };
  });
}

const priorityLabel: Record<Priority, string> = { high: "🔴 Wysoki", medium: "🟡 Średni", low: "🟢 Niski", spam: "⚫ Spam" };

export default function EmailTriagePage() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const cards = useMemo(() => parseCards(result), [result]);
  const summary = useMemo(() => ({ high: cards.filter((card) => card.priority === "high").length, medium: cards.filter((card) => card.priority === "medium").length, low: cards.filter((card) => card.priority === "low").length, spam: cards.filter((card) => card.priority === "spam").length }), [cards]);

  async function analyze(event: FormEvent) {
    event.preventDefault();
    const emails = input.split(/\n\s*\n(?=Od:|From:)/i).map((email) => email.trim()).filter(Boolean);
    if (!emails.length) { setError("Wklej co najmniej jednego maila."); return; }
    if (emails.length > 5) { setError("Jednorazowo możesz analizować maksymalnie 5 maili."); return; }
    setError(""); setResult(""); setLoading(true);
    try {
      const response = await fetch("/api/email-triage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emails }) });
      if (!response.ok || !response.body) { const data = await response.json().catch(() => null); throw new Error(data?.error ?? "Nie udało się rozpocząć analizy."); }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let pending = true;
      while (pending) { const { value, done } = await reader.read(); pending = !done; if (value) setResult((current) => current + decoder.decode(value, { stream: !done })); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Wystąpił nieoczekiwany błąd."); }
    finally { setLoading(false); }
  }

  async function copyDraft(card: EmailCard) {
    await navigator.clipboard.writeText(card.draft);
    setCopied(card.number); window.setTimeout(() => setCopied(null), 1600);
  }

  return <main className="page page-scroll app-page"><AppNav /><section className="triage-shell">
    <header className="triage-hero"><div><span className="triage-kicker">Skrzynka pod kontrolą</span><h1>📧 E-mail Triage</h1><p>Wklej maile — agent posortuje i napisze odpowiedzi.</p></div><span className="triage-limit">do 5 maili</span></header>
    <form className="triage-form" onSubmit={analyze}><label htmlFor="emails">Wiadomości do analizy</label><textarea id="emails" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Wklej maile tutaj — oddziel je pustą linią..." minLength={10} /><div className="triage-actions"><button className="secondary-button" type="button" onClick={() => setInput(exampleEmails)}>📋 Wklej przykład</button><button className="chat-submit" type="submit" disabled={loading}>{loading ? "Analizuję maile..." : "📧 Analizuj maile"}</button></div>{error ? <p className="triage-error" role="alert">{error}</p> : null}</form>
    {cards.length ? <section className="triage-results" aria-live="polite"><div className="triage-summary"><div><span>Podsumowanie</span><strong>{summary.high} pilne, {summary.medium} średnie, {summary.low} niskie, {summary.spam} spam</strong></div>{loading ? <span className="triage-streaming">Analiza w toku…</span> : null}</div><div className="triage-card-list">{cards.map((card) => <article className={`triage-card triage-card-${card.priority}`} key={card.number}><header><span className="triage-email-number">Mail {card.number}</span><span className="triage-priority">{priorityLabel[card.priority]}</span></header><h2>{card.subject}</h2><dl><div><dt>Kategoria</dt><dd>{card.category}</dd></div><div><dt>Uzasadnienie</dt><dd>{card.reason}</dd></div></dl><div className="triage-draft"><div><span>Proponowana odpowiedź</span><button className="triage-copy" type="button" onClick={() => void copyDraft(card)}>{copied === card.number ? "Skopiowano ✓" : "Kopiuj draft"}</button></div><blockquote>{card.draft}</blockquote></div></article>)}</div></section> : null}
    {loading && !cards.length ? <p className="triage-progress" aria-live="polite">Agent czyta i układa priorytety…</p> : null}
  </section></main>;
}
