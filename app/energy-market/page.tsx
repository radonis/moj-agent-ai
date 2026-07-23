"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, UIMessage } from "ai";
import { useMemo } from "react";
import { AppNav } from "../components/app-nav";
import { SimpleMarkdown } from "../components/simple-markdown";
import { ChatMetadata } from "../lib/agent";

function messageText(message?: UIMessage<ChatMetadata>) { return message?.parts.filter((part) => part.type === "text").map((part) => part.text).join("") ?? ""; }

export default function EnergyMarketPage() {
  const transport = useMemo(() => new DefaultChatTransport<UIMessage<ChatMetadata>>({ api: "/api/energy-market" }), []);
  const { messages, sendMessage, status } = useChat<UIMessage<ChatMetadata>>({ transport });
  const isLoading = status === "submitted" || status === "streaming"; const content = messageText([...messages].reverse().find((message) => message.role === "assistant"));
  return <main className="page page-scroll app-page"><AppNav /><section className="energy-shell"><header className="energy-hero"><div><span className="triage-kicker">Daily market monitor</span><h1>⚡ Rynek energii</h1><p>Poranny briefing: waluty, paliwa, energia elektryczna i CO₂.</p></div><button className="chat-submit energy-refresh" type="button" onClick={() => void sendMessage({ text: "Przygotuj aktualny poranny brief rynku energii." })} disabled={isLoading}>{isLoading ? "Odświeżam dane…" : "↻ Odśwież dane"}</button></header><section className="energy-watchlist"><span>Obserwowane benchmarki</span><div><span>USD/PLN</span><span>EUR/PLN</span><span>API2 ARA</span><span>TTF</span><span>TGE RDN</span><span>BASE Y+1</span><span>EUA Dec</span></div></section>{isLoading && !content ? <div className="report-progress" aria-live="polite"><strong>Agent zbiera poranne dane rynkowe…</strong><span>Weryfikuję notowania i źródła.</span></div> : null}{content ? <article className="energy-output"><header><div><span className="triage-kicker">Aktualny briefing</span><h2>{isLoading ? "Brief jest jeszcze uzupełniany…" : "Snapshot rynku"}</h2></div><span className="energy-live">● ręczne odświeżenie</span></header><SimpleMarkdown content={content} /></article> : <div className="energy-empty"><strong>Gotowy na poranny przegląd?</strong><span>Kliknij „Odśwież dane”, aby pobrać aktualny snapshot rynku.</span></div>}</section></main>;
}
