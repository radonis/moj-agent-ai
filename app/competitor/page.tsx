"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, UIMessage } from "ai";
import { FormEvent, useMemo, useState } from "react";
import { AppNav } from "../components/app-nav";
import { SimpleMarkdown } from "../components/simple-markdown";
import { ChatMetadata } from "../lib/agent";

const examples = [
  ["Shopify", "WooCommerce", "PrestaShop"], ["Notion", "Obsidian", "Evernote"], ["Vercel", "Netlify", "Railway"], ["ChatGPT", "Claude", "Gemini"],
];
function messageText(message?: UIMessage<ChatMetadata>) { return message?.parts.filter((part) => part.type === "text").map((part) => part.text).join("") ?? ""; }

export default function CompetitorPage() {
  const transport = useMemo(() => new DefaultChatTransport<UIMessage<ChatMetadata>>({ api: "/api/competitor" }), []);
  const { messages, sendMessage, status } = useChat<UIMessage<ChatMetadata>>({ transport });
  const [companies, setCompanies] = useState(["", "", ""]); const [context, setContext] = useState(""); const [copied, setCopied] = useState(false);
  const isLoading = status === "submitted" || status === "streaming"; const content = messageText([...messages].reverse().find((message) => message.role === "assistant"));
  function setCompany(index: number, value: string) { setCompanies((current) => current.map((company, itemIndex) => itemIndex === index ? value : company)); }
  async function compare(event: FormEvent) { event.preventDefault(); if (companies.some((company) => !company.trim()) || isLoading) return; setCopied(false); const prompt = `Porównaj firmy: ${companies.map((company, index) => `${index + 1}. ${company.trim()}`).join("; ")}.${context.trim() ? `\n\nKontekst użytkownika: ${context.trim()}` : ""}`; await sendMessage({ text: prompt }); }
  async function copyAnalysis() { if (!content) return; await navigator.clipboard.writeText(content); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
  return <main className="page page-scroll app-page"><AppNav /><section className="competitor-shell"><header className="competitor-hero"><span className="triage-kicker">Market intelligence</span><h1>🟢 Analiza konkurencji</h1><p>Podaj firmy — agent porówna je za Ciebie.</p></header><form className="competitor-form" onSubmit={compare}><div className="competitor-inputs">{companies.map((company, index) => <label key={index}>Firma {index + 1}<input value={company} onChange={(event) => setCompany(index, event.target.value)} placeholder={["Np. Shopify", "Np. WooCommerce", "Np. PrestaShop"][index]} /></label>)}</div><label>Kontekst <span>(opcjonalnie)</span><textarea value={context} onChange={(event) => setContext(event.target.value)} placeholder="Np. Szukam platformy e-commerce dla małego sklepu" /></label><button className="chat-submit" type="submit" disabled={companies.some((company) => !company.trim()) || isLoading}>{isLoading ? "Porównuję firmy..." : "🔎 Porównaj"}</button></form><section className="competitor-examples" aria-label="Przykładowe porównania"><span>Przykładowe porównania:</span><div>{examples.map((example) => <button key={example.join("-")} type="button" onClick={() => setCompanies(example)} disabled={isLoading}>{example.join(" vs ")}</button>)}</div></section>{isLoading && !content ? <div className="report-progress" aria-live="polite"><strong>Agent zbiera dane o firmach…</strong><span>Porównanie powstaje na podstawie źródeł.</span></div> : null}{content ? <article className="competitor-output"><header><div><span className="triage-kicker">Wynik analizy</span><h2>{isLoading ? "Analiza jest jeszcze uzupełniana…" : "Porównanie gotowe"}</h2></div><button className="secondary-button" type="button" onClick={() => void copyAnalysis()}>{copied ? "Skopiowano ✓" : "📋 Kopiuj analizę"}</button></header><SimpleMarkdown content={content} /></article> : null}</section></main>;
}
