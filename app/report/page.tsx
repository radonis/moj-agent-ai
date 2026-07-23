"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, UIMessage } from "ai";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AppNav } from "../components/app-nav";
import { SimpleMarkdown } from "../components/simple-markdown";
import { ChatMetadata } from "../lib/agent";
import { getAuthenticatedUser } from "../lib/auth";
import { supabase } from "../lib/supabase";

type SavedReport = { id: string; topic: string; content: string; created_at: string };

const examples = [
  "Rynek AI w Polsce — trendy, firmy, prognozy na 2026",
  "Porównanie platform e-commerce: Shopify vs WooCommerce vs PrestaShop",
  "Wpływ pracy zdalnej na produktywność — badania i statystyki",
  "Rynek nieruchomości w Krakowie — ceny, trendy, prognozy",
];

function messageText(message?: UIMessage<ChatMetadata>) {
  return message?.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("") ?? "";
}

function reportDate(value: string) {
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function ReportPage() {
  const transport = useMemo(
    () => new DefaultChatTransport<UIMessage<ChatMetadata>>({ api: "/api/report" }),
    [],
  );
  const { messages, sendMessage, status } = useChat<UIMessage<ChatMetadata>>({ transport });
  const [topic, setTopic] = useState("");
  const [currentTopic, setCurrentTopic] = useState("");
  const [copied, setCopied] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [historyStatus, setHistoryStatus] = useState("Ładuję zapisane raporty…");
  const isLoading = status === "submitted" || status === "streaming";
  const content = messageText([...messages].reverse().find((message) => message.role === "assistant"));

  const loadSavedReports = useCallback(async () => {
    if (!supabase) { setHistoryStatus("Brak konfiguracji bazy raportów."); return; }
    try {
      const user = await getAuthenticatedUser();
      const { data, error } = await supabase
        .from("reports")
        .select("id, topic, content, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      setSavedReports((data ?? []) as SavedReport[]);
      setHistoryStatus(data?.length ? "" : "Nie masz jeszcze zapisanych raportów.");
    } catch (error) {
      setHistoryStatus(error instanceof Error ? `Nie udało się wczytać raportów: ${error.message}` : "Nie udało się wczytać raportów.");
    }
  }, []);

  useEffect(() => { void loadSavedReports(); }, [loadSavedReports]);

  async function generate(event: FormEvent) {
    event.preventDefault();
    const value = topic.trim();
    if (!value || isLoading) return;
    setCopied(false);
    setSaveStatus("");
    setCurrentTopic(value);
    setTopic("");
    await sendMessage({ text: value });
  }

  async function copyReport() {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function saveReport() {
    if (!supabase || !content || !currentTopic) { setSaveStatus("Brak konfiguracji zapisu raportów."); return; }
    setSaveStatus("Zapisuję…");
    try {
      const user = await getAuthenticatedUser();
      const { error } = await supabase.from("reports").insert({ user_id: user.id, topic: currentTopic, content });
      if (error) throw error;
      setSaveStatus("Zapisano w bazie ✓");
      await loadSavedReports();
    } catch (error) {
      setSaveStatus(error instanceof Error ? `Nie udało się zapisać: ${error.message}` : "Nie udało się zapisać raportu.");
    }
  }

  return <main className="page page-scroll app-page"><AppNav /><section className="report-shell">
    <header className="report-hero"><span className="triage-kicker">Research & insight</span><h1>📊 Generator raportów</h1><p>Opisz temat — agent zbierze dane i napisze raport biznesowy.</p></header>
    <form className="report-form" onSubmit={generate}><label htmlFor="report-topic">O czym ma być raport?</label><div><input id="report-topic" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Np. Rynek AI w Polsce w 2026 roku..." autoComplete="off" /><button className="chat-submit" type="submit" disabled={!topic.trim() || isLoading}>{isLoading ? "Tworzę raport..." : "📊 Generuj raport"}</button></div></form>
    <section className="report-examples" aria-label="Przykładowe tematy"><span>Przykładowe tematy:</span><div>{examples.map((example) => <button key={example} type="button" onClick={() => setTopic(example)} disabled={isLoading}>{example}</button>)}</div></section>
    {isLoading && !content ? <div className="report-progress" aria-live="polite"><strong>Agent zbiera dane i analizuje temat…</strong><span>To może potrwać chwilę — raport powstaje na podstawie źródeł.</span></div> : null}
    {content ? <article className="report-output"><header><div><span className="triage-kicker">Gotowy raport</span><h2>{isLoading ? "Raport jest jeszcze uzupełniany…" : "Raport gotowy"}</h2></div><div className="report-output-actions"><button className="secondary-button" type="button" onClick={() => void copyReport()}>{copied ? "Skopiowano ✓" : "📋 Kopiuj do schowka"}</button><button className="chat-submit report-save-button" type="button" onClick={() => void saveReport()} disabled={isLoading || saveStatus === "Zapisuję…"}>💾 Zapisz w bazie</button></div></header>{saveStatus ? <p className="report-save-status" role="status">{saveStatus}</p> : null}<SimpleMarkdown content={content} /></article> : null}
    <section className="report-history" aria-labelledby="report-history-heading"><header><div><span className="triage-kicker">Twoja baza</span><h2 id="report-history-heading">Ostatnie raporty</h2></div><button className="secondary-button" type="button" onClick={() => void loadSavedReports()}>Odśwież</button></header>{savedReports.length ? <div className="report-history-list">{savedReports.map((report) => <details key={report.id} className="report-history-item"><summary><div><strong>{report.topic}</strong><span>{reportDate(report.created_at)}</span></div><span>Rozwiń raport</span></summary><div className="report-history-content"><SimpleMarkdown content={report.content} /></div></details>)}</div> : <p className="report-history-empty">{historyStatus}</p>}</section>
  </section></main>;
}
