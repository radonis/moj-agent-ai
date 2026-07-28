"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppNav } from "./app-nav";
import { SimpleMarkdown } from "./simple-markdown";
import { supabase } from "../lib/supabase";

type Briefing = { id: string; content: string; created_at: string };
function formatBriefingDate(value: string) { return new Intl.DateTimeFormat("pl-PL", { dateStyle: "full", timeStyle: "short" }).format(new Date(value)); }

export function BriefingDetail() {
  const params = useParams<{ id: string }>();
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [status, setStatus] = useState("Ładuję briefing…");
  const [copied, setCopied] = useState(false);
  useEffect(() => { async function loadBriefing() {
    if (!supabase) { setStatus("Brak konfiguracji połączenia z bazą briefingów."); return; }
    const { data, error } = await supabase.from("briefings").select("id, content, created_at").eq("id", params.id).maybeSingle();
    if (error) { setStatus(`Nie udało się wczytać briefingu: ${error.message}`); return; }
    if (!data) { setStatus("Nie znaleziono tego briefingu."); return; }
    setBriefing(data as Briefing); setStatus("");
  } void loadBriefing(); }, [params.id]);
  async function copyBriefing() { if (!briefing) return; await navigator.clipboard.writeText(briefing.content); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
  return <main className="page page-scroll app-page"><AppNav /><section className="briefings-shell"><div className="briefing-detail-actions"><Link className="secondary-button" href="/briefings">← Wróć do listy</Link>{briefing ? <button className="secondary-button" type="button" onClick={() => void copyBriefing()}>{copied ? "Skopiowano ✓" : "📋 Kopiuj"}</button> : null}</div>{briefing ? <article className="briefing-detail"><header><span className="triage-kicker">Poranny briefing</span><h1>📰 Briefing dnia</h1><time dateTime={briefing.created_at}>{formatBriefingDate(briefing.created_at)}</time></header><SimpleMarkdown content={briefing.content} /></article> : <section className="briefings-empty"><strong>{status}</strong></section>}</section></main>;
}
