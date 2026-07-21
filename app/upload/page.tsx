"use client";

import { useEffect, useMemo, useState } from "react";
import { AppNav } from "../components/app-nav";
import { splitIntoChunks } from "../lib/chunking";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "../lib/knowledge";

type KnowledgeDocumentSummary = {
  title: string;
  chunks: number;
  createdAt: string | null;
};

type UploadEvent =
  | { type: "start"; total: number }
  | { type: "progress"; current: number; total: number; message?: string }
  | { type: "complete"; success: true; chunks_saved: number }
  | { type: "error"; error: string };

const exampleDocuments = [
  {
    label: "Cennik 2026",
    title: "Cennik 2026",
    content:
      "Pakiet Basic: 99 zl/mies. - 5 uzytkownikow, 10 GB miejsca, wsparcie email. Pakiet Premium: 299 zl/mies. - 25 uzytkownikow, 100 GB miejsca, wsparcie email + telefon, priorytetowa obsluga. Pakiet VIP: 599 zl/mies. - nielimitowani uzytkownicy, 1 TB miejsca, wsparcie 24/7, dedykowany opiekun.",
  },
  {
    label: "FAQ",
    title: "FAQ subskrypcji",
    content:
      "Q: Jak anulowac subskrypcje? A: Wyslij email na support@firma.pl. Q: Czy jest okres probny? A: Tak, 14 dni bez oplat. Q: Czy wystawiacie fakture VAT? A: Tak, faktura generuje sie automatycznie po platnosci.",
  },
  {
    label: "Regulamin",
    title: "Regulamin firmy",
    content:
      "Paragraf 1. Postanowienia ogolne. 1.1 Niniejszy regulamin okresla zasady korzystania z platformy. 1.2 Usluga swiadczona jest w modelu subskrypcyjnym. Paragraf 2. Platnosci. 2.1 Oplaty pobierane sa z gory za miesiac lub rok.",
  },
];

function formatDate(value: string | null) {
  if (!value) {
    return "Brak daty";
  }

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function parseUploadStream(response: Response, onEvent: (event: UploadEvent) => void) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Brak strumienia odpowiedzi z serwera.");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      onEvent(JSON.parse(trimmed) as UploadEvent);
    }
  }

  if (buffer.trim()) {
    onEvent(JSON.parse(buffer.trim()) as UploadEvent);
  }
}

export default function UploadPage() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [documents, setDocuments] = useState<KnowledgeDocumentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [refreshKey, setRefreshKey] = useState(0);

  const estimatedChunks = useMemo(() => splitIntoChunks(content).length, [content]);

  useEffect(() => {
    let isActive = true;

    async function loadDocuments() {
      try {
        const response = await fetch("/api/upload-knowledge", { cache: "no-store" });
        const data = (await response.json()) as {
          documents?: KnowledgeDocumentSummary[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error || "Nie udalo sie pobrac dokumentow.");
        }

        if (isActive) {
          setDocuments(data.documents ?? []);
        }
      } catch (requestError) {
        if (isActive) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Nie udalo sie pobrac dokumentow.",
          );
        }
      }
    }

    void loadDocuments();
    return () => {
      isActive = false;
    };
  }, [refreshKey]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (!trimmedTitle || !trimmedContent || isLoading) {
      return;
    }

    setIsLoading(true);
    setError("");
    setStatus("");
    setProgress({ current: 0, total: estimatedChunks });

    try {
      const response = await fetch("/api/upload-knowledge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: trimmedTitle,
          content: trimmedContent,
        }),
      });

      if (!response.ok && !response.body) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Nie udalo sie zapisac dokumentu.");
      }

      await parseUploadStream(response, (eventData) => {
        if (eventData.type === "start") {
          setProgress({ current: 0, total: eventData.total });
          setStatus(`Przygotowano ${eventData.total} fragmentow do zapisu.`);
        }

        if (eventData.type === "progress") {
          setProgress({ current: eventData.current, total: eventData.total });
          setStatus(
            eventData.message ||
              `Przetwarzam fragment ${eventData.current} z ${eventData.total}...`,
          );
        }

        if (eventData.type === "complete") {
          setProgress({ current: eventData.chunks_saved, total: eventData.chunks_saved });
          setStatus(`Zapisano ${eventData.chunks_saved} fragmentow.`);
        }

        if (eventData.type === "error") {
          throw new Error(eventData.error);
        }
      });

      setTitle("");
      setContent("");
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Nie udalo sie zapisac dokumentu.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete(documentTitle: string) {
    if (isLoading) {
      return;
    }

    setError("");
    try {
      const response = await fetch(
        `/api/upload-knowledge?title=${encodeURIComponent(documentTitle)}`,
        { method: "DELETE" },
      );

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Nie udalo sie usunac dokumentu.");
      }

      setStatus(`Usunieto dokument "${documentTitle}".`);
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Nie udalo sie usunac dokumentu.",
      );
    }
  }

  function fillExample(titleValue: string, contentValue: string) {
    setTitle(titleValue);
    setContent(contentValue);
  }

  const progressPercent =
    progress.total > 0 ? Math.min(100, Math.round((progress.current / progress.total) * 100)) : 0;

  return (
    <main className="page app-page upload-page">
      <AppNav />

      <section className="upload-shell">
        <header className="upload-hero">
          <div>
            <span className="upload-kicker">Baza wiedzy</span>
            <h1>Wklej tekst, a agent zapamieta fakty z Twoich dokumentow</h1>
            <p>
              Dodaj cennik, FAQ albo regulamin. Aplikacja podzieli tekst na fragmenty,
              wygeneruje embeddingi i zapisze wszystko w Supabase.
            </p>
          </div>
          <div className="upload-hero-badges">
            <span>
              Model embeddingu: {EMBEDDING_MODEL} ({EMBEDDING_DIMENSIONS}D)
            </span>
            <span>Szacowane fragmenty: {estimatedChunks || 0}</span>
          </div>
        </header>

        <div className="upload-grid">
          <form className="upload-card upload-form-card" onSubmit={handleSubmit}>
            <div className="profile-card-head">
              <div>
                <h2>Nowy dokument</h2>
                <span>Wklej wiedze i zapisz ja do bazy wektorowej.</span>
              </div>
            </div>

            <div className="profile-field">
              <span>Tytul dokumentu</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Np. Cennik 2026, FAQ, Regulamin firmy"
                disabled={isLoading}
              />
            </div>

            <div className="profile-field profile-field-wide">
              <span>Tresc dokumentu</span>
              <textarea
                className="upload-textarea"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Wklej tutaj tresc dokumentu..."
                disabled={isLoading}
              />
            </div>

            <div className="upload-example-list">
              {exampleDocuments.map((example) => (
                <button
                  key={example.label}
                  className="starter-button"
                  type="button"
                  onClick={() => fillExample(example.title, example.content)}
                  disabled={isLoading}
                >
                  {example.label}
                </button>
              ))}
            </div>

            <div className="upload-actions">
              <button
                className="chat-submit"
                type="submit"
                disabled={isLoading || !title.trim() || !content.trim()}
              >
                Zapisz w bazie wiedzy
              </button>
              <span className="upload-helper">
                Tekst zostanie podzielony na fragmenty okolo 500 znakow.
              </span>
            </div>

            {progress.total > 0 ? (
              <section className="upload-progress-card" aria-live="polite">
                <div className="upload-progress-topline">
                  <strong>{isLoading ? "Przetwarzanie dokumentu" : "Gotowe"}</strong>
                  <span>
                    {progress.current}/{progress.total}
                  </span>
                </div>
                <div className="react-progress-track" aria-hidden="true">
                  <span
                    className="react-progress-fill"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p>{status || "Czekam na rozpoczecie przetwarzania."}</p>
              </section>
            ) : null}

            {error ? <p className="image-feedback image-feedback-error">{error}</p> : null}
            {!error && status && progress.total === 0 ? (
              <p className="profile-status">{status}</p>
            ) : null}
          </form>

          <section className="upload-card upload-documents-card">
            <div className="profile-card-head">
              <div>
                <h2>Zapisane dokumenty</h2>
                <span>Lista unikalnych tytulow z tabeli documents.</span>
              </div>
            </div>

            {documents.length === 0 ? (
              <div className="empty-state upload-empty-state">
                <p>Nie ma jeszcze dokumentow w bazie wiedzy.</p>
              </div>
            ) : (
              <div className="upload-documents-list">
                {documents.map((document) => (
                  <article key={document.title} className="upload-document-row">
                    <div>
                      <strong>{document.title}</strong>
                      <p>{document.chunks} fragmentow</p>
                      <span>Dodano: {formatDate(document.createdAt)}</span>
                    </div>
                    <button
                      className="secondary-button upload-delete-button"
                      type="button"
                      onClick={() => void handleDelete(document.title)}
                      disabled={isLoading}
                    >
                      Usun
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
