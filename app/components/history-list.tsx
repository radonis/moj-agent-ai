"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { AppNav } from "./app-nav";

type HistoryMessage = {
  id: string;
  content: string;
  created_at: string;
};

type Conversation = {
  id: string;
  title: string | null;
  updated_at: string;
  messages: HistoryMessage[];
};

function formatDate(value: string) {
  const date = new Date(value);
  const difference = Date.now() - date.getTime();
  const hours = Math.floor(difference / 3_600_000);

  if (hours < 1) return "przed chwila";
  if (hours < 24) return `${hours} godz. temu`;
  if (hours < 48) return "wczoraj";

  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function HistoryList() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  async function loadConversations() {
    if (!supabase) {
      setStatus("Brak konfiguracji Supabase.");
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("conversations")
      .select("id,title,updated_at,messages(id,content,created_at)")
      .order("updated_at", { ascending: false });

    if (error) {
      setStatus(`Nie moge wczytac historii: ${error.message}`);
    } else {
      setConversations((data ?? []) as unknown as Conversation[]);
      setStatus("");
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadConversations();
  }, []);

  const filteredConversations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return conversations;

    return conversations.filter((conversation) =>
      [conversation.title, ...conversation.messages.map((message) => message.content)]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery)),
    );
  }, [conversations, query]);

  async function deleteConversation(id: string) {
    if (!supabase) return;

    const confirmed = window.confirm(
      "Czy na pewno chcesz usunac te rozmowe? Tej operacji nie mozna cofnac.",
    );
    if (!confirmed) return;

    const { error: messagesError } = await supabase
      .from("messages")
      .delete()
      .eq("conversation_id", id);
    if (messagesError) {
      setStatus(`Nie moge usunac wiadomosci: ${messagesError.message}`);
      return;
    }

    const { error: conversationError } = await supabase
      .from("conversations")
      .delete()
      .eq("id", id);
    if (conversationError) {
      setStatus(`Nie moge usunac rozmowy: ${conversationError.message}`);
      return;
    }

    setConversations((current) => current.filter((conversation) => conversation.id !== id));
    setStatus("Rozmowa usunieta.");
  }

  return (
    <main className="page page-scroll app-page history-page">
      <AppNav />
      <section className="history-shell">
        <header className="history-header">
          <div>
            <p className="history-kicker">Twoja pamiec</p>
            <h1>Historia rozmow</h1>
            <p>Wszystkie Twoje rozmowy z agentem.</p>
          </div>
          <Link className="history-primary-action" href="/chat">
            Rozpocznij rozmowe
          </Link>
        </header>

        <input
          className="history-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Szukaj w rozmowach..."
        />

        {status ? <p className="history-status">{status}</p> : null}
        {loading ? <p className="history-empty">Laduje rozmowy...</p> : null}

        {!loading && filteredConversations.length === 0 ? (
          <div className="history-empty">
            <p>
              {query
                ? "Nie znaleziono pasujacych rozmow."
                : "Nie masz jeszcze zadnych rozmow. Zacznij nowa!"}
            </p>
          </div>
        ) : null}

        <div className="history-list">
          {filteredConversations.map((conversation) => {
            const latestMessage = [...conversation.messages].sort((a, b) =>
              a.created_at.localeCompare(b.created_at),
            ).at(-1);

            return (
              <article key={conversation.id} className="history-card">
                <Link className="history-card-link" href={`/history/${conversation.id}`}>
                  <div className="history-card-topline">
                    <h2>{conversation.title || "Nowa rozmowa"}</h2>
                    <span>{formatDate(conversation.updated_at)}</span>
                  </div>
                  <p className="history-meta">{conversation.messages.length} wiadomosci</p>
                  <p className="history-preview">
                    {latestMessage?.content.slice(0, 100) || "Brak wiadomosci w rozmowie."}
                  </p>
                </Link>
                <button
                  className="history-delete"
                  type="button"
                  onClick={() => void deleteConversation(conversation.id)}
                >
                  Usun
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
