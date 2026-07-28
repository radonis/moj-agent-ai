"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppNav } from "./app-nav";
import { supabase } from "../lib/supabase";

type Briefing = { id: string; content: string; created_at: string; date: string | null };

function formatBriefingDate(value: string) {
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "full", timeStyle: "short" }).format(new Date(value));
}

function preview(content: string) {
  const normalized = content.replace(/^#{1,6}\s+/gm, "").replace(/\s+/g, " ").trim();
  return normalized.length > 150 ? `${normalized.slice(0, 150).trimEnd()}…` : normalized;
}

export function BriefingsList() {
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [status, setStatus] = useState("Ładuję briefingi…");
  const [isGenerating, setIsGenerating] = useState(false);

  const loadBriefings = useCallback(async () => {
    if (!supabase) { setStatus("Brak konfiguracji połączenia z bazą briefingów."); return; }
    setStatus("Ładuję briefingi…");
    const { data, error } = await supabase.from("briefings").select("id, content, created_at, date").order("created_at", { ascending: false }).limit(30);
    if (error) { setBriefings([]); setStatus(`Nie udało się wczytać briefingów: ${error.message}`); return; }
    setBriefings((data ?? []) as Briefing[]);
    setStatus(data?.length ? "" : "Brak briefingów. Cron job wygeneruje pierwszy jutro rano!");
  }, []);

  useEffect(() => { void loadBriefings(); }, [loadBriefings]);

  async function generateNow() {
    setIsGenerating(true); setStatus("Generuję poranny briefing…");
    try {
      const response = await fetch("/api/cron/morning");
      if (!response.ok) throw new Error((await response.text()) || "Nie udało się uruchomić generatora.");
      await loadBriefings();
    } catch (error) {
      setStatus(error instanceof Error ? `Nie udało się wygenerować briefingu: ${error.message}` : "Nie udało się wygenerować briefingu.");
    } finally { setIsGenerating(false); }
  }

  return <main className="page page-scroll app-page"><AppNav /><section className="briefings-shell">
    <header className="briefings-hero"><div><span className="triage-kicker">Automatyczne raporty</span><h1>📰 Briefingi</h1><p>Automatyczne podsumowania dnia od Twojego agenta.</p></div><button className="chat-submit briefings-generate" type="button" onClick={() => void generateNow()} disabled={isGenerating}>{isGenerating ? "Generuję…" : "↻ Wygeneruj teraz"}</button></header>
    {briefings.length ? <section className="briefings-list" aria-label="Lista briefingów">{briefings.map((briefing) => <Link key={briefing.id} href={`/briefings/${briefing.id}`} className="briefing-card"><div className="briefing-card-topline"><time dateTime={briefing.created_at}>{formatBriefingDate(briefing.created_at)}</time><span>✓ wygenerowany automatycznie</span></div><p>{preview(briefing.content)}</p><span className="briefing-card-open">Otwórz pełną treść →</span></Link>)}</section> : <section className="briefings-empty"><strong>{status || "Brak briefingów. Cron job wygeneruje pierwszy jutro rano!"}</strong><span>Możesz uruchomić generator ręcznie, aby od razu zobaczyć pierwszy raport.</span><button className="chat-submit" type="button" onClick={() => void generateNow()} disabled={isGenerating}>{isGenerating ? "Generuję…" : "↻ Wygeneruj teraz"}</button></section>}
    {briefings.length && status ? <p className="briefings-status" role="status">{status}</p> : null}
  </section></main>;
}
