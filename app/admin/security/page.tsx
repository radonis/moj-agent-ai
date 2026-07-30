"use client";

import { useEffect, useState } from "react";
import { AppNav } from "../../components/app-nav";
import { supabase } from "../../lib/supabase";

type SecurityData = { blocked: Array<{ email: string; message: string; block_reason: string | null; created_at: string }>; topUsers: Array<{ email: string; today: number; week: number; percent: number }>; alerts: Array<{ type: string; text: string }>; stats: { totalToday: number; totalWeek: number; blockedCount: number; averagePerUser: number } };

export default function SecurityPage() {
  const [data, setData] = useState<SecurityData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      if (!supabase) return setError("Brak konfiguracji Supabase.");
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return setError("Zaloguj się jako administrator.");
      const response = await fetch("/api/admin/security", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) return setError(payload.error ?? "Nie udało się pobrać panelu.");
      setData(payload);
    }
    void load();
  }, []);

  return <main className="page page-scroll app-page"><AppNav /><section className="dashboard-shell"><header className="dashboard-header"><div><p className="triage-kicker">Monitoring</p><h1>🛡️ Panel bezpieczeństwa</h1><p>Blokady, zużycie tokenów i alerty z ostatnich 7 dni.</p></div></header>{error ? <div className="empty-state"><p>{error}</p></div> : !data ? <div className="empty-state"><p>Ładuję dane bezpieczeństwa…</p></div> : <><div className="dashboard-grid">{[["Tokeny dziś", data.stats.totalToday], ["Tokeny tydzień", data.stats.totalWeek], ["Zablokowane", data.stats.blockedCount], ["Średnio / user", data.stats.averagePerUser]].map(([label, value]) => <article className="dashboard-card" key={String(label)}><span>{label}</span><strong>{Number(value).toLocaleString("pl-PL")}</strong></article>)}</div><section className="dashboard-section"><h2>🔴 Alerty</h2>{data.alerts.length ? data.alerts.map((alert, i) => <p key={i}><strong>{alert.type}:</strong> {alert.text}</p>) : <p>Brak aktywnych alertów.</p>}</section><section className="dashboard-section"><h2>📊 Top 5 użytkowników po zużyciu</h2><div className="history-list">{data.topUsers.length ? data.topUsers.map((user) => <article className="history-item" key={user.email}><strong>{user.email}</strong><p>Dziś: {user.today.toLocaleString("pl-PL")} ({user.percent}% limitu) · Tydzień: {user.week.toLocaleString("pl-PL")}</p></article>) : <p>Brak danych o zużyciu.</p>}</div></section><section className="dashboard-section"><h2>⚠️ Zablokowane wiadomości</h2><div className="history-list">{data.blocked.length ? data.blocked.map((item, i) => <article className="history-item" key={`${item.created_at}-${i}`}><strong>{item.email}</strong><p>{item.message.slice(0, 160)}{item.message.length > 160 ? "…" : ""}</p><small>{item.block_reason ?? "Blokada bezpieczeństwa"} · {new Date(item.created_at).toLocaleString("pl-PL")}</small></article>) : <p>Brak zablokowanych wiadomości.</p>}</div></section></>}</section></main>;
}
