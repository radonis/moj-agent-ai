"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { getAuthenticatedUser } from "../lib/auth";
import { AppNav } from "./app-nav";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type Conversation = {
  id: string;
  title: string | null;
  updated_at: string;
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

export function HistoryDetail() {
  const params = useParams<{ id: string }>();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState("Laduje rozmowe...");

  useEffect(() => {
    async function loadConversation() {
      if (!supabase) {
        setStatus("Brak konfiguracji Supabase.");
        return;
      }
      let user;
      try {
        user = await getAuthenticatedUser();
      } catch {
        setStatus("Wymagane logowanie.");
        return;
      }

      const { data: conversationData, error: conversationError } = await supabase
        .from("conversations")
        .select("id,title,updated_at")
        .eq("id", params.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (conversationError || !conversationData) {
        setStatus("Nie znaleziono tej rozmowy.");
        return;
      }

      const { data: messageData, error: messageError } = await supabase
        .from("messages")
        .select("id,role,content,created_at")
        .eq("conversation_id", params.id)
        .order("created_at", { ascending: true });

      if (messageError) {
        setStatus(`Nie moge wczytac wiadomosci: ${messageError.message}`);
        return;
      }

      setConversation(conversationData as Conversation);
      setMessages((messageData ?? []) as Message[]);
      setStatus("");
    }

    void loadConversation();
  }, [params.id]);

  return (
    <main className="page page-scroll app-page history-page">
      <AppNav />
      <section className="history-shell history-detail-shell">
        <div className="history-detail-actions">
          <Link className="secondary-button" href="/history">Powrot do listy</Link>
          {conversation ? (
            <Link className="history-primary-action" href={`/chat?conversation=${conversation.id}`}>
              Kontynuuj rozmowe
            </Link>
          ) : null}
        </div>

        {status ? <p className="history-status">{status}</p> : null}
        {conversation ? (
          <header className="history-header history-detail-header">
            <div>
              <p className="history-kicker">Zapis rozmowy</p>
              <h1>{conversation.title || "Nowa rozmowa"}</h1>
              <p>Ostatnia aktywnosc: {formatTime(conversation.updated_at)}</p>
            </div>
          </header>
        ) : null}

        <div className="history-messages">
          {messages.map((message) => (
            <article key={message.id} className={`history-message ${message.role}`}>
              <p className="history-message-meta">
                {message.role === "user" ? "Ty" : "Marta"} | {formatTime(message.created_at)}
              </p>
              <p>{message.content}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
