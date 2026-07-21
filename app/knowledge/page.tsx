"use client";

import { useEffect, useState } from "react";
import { AppNav } from "../components/app-nav";

type KnowledgeDocumentSummary = {
  title: string;
  chunks: number;
  createdAt: string | null;
};

type KnowledgeChunk = {
  id: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string | null;
};

type KnowledgeSearchResult = {
  title: string;
  content: string;
  similarity: number;
  metadata?: Record<string, unknown> | null;
  added_at?: string | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "brak daty";

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function KnowledgePage() {
  const [documents, setDocuments] = useState<KnowledgeDocumentSummary[]>([]);
  const [chunks, setChunks] = useState<KnowledgeChunk[]>([]);
  const [activeTitle, setActiveTitle] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KnowledgeSearchResult[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const totalChunks = documents.reduce((sum, document) => sum + document.chunks, 0);

  useEffect(() => {
    let isActive = true;

    async function loadDocuments() {
      setIsLoading(true);
      setError("");

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
          const loadedDocuments = data.documents ?? [];
          setDocuments(loadedDocuments);
          if (loadedDocuments[0]) {
            setActiveTitle(loadedDocuments[0].title);
          }
        }
      } catch (requestError) {
        if (isActive) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Nie udalo sie pobrac dokumentow.",
          );
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadDocuments();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadChunks() {
      if (!activeTitle) {
        setChunks([]);
        return;
      }

      setError("");
      try {
        const response = await fetch(
          `/api/upload-knowledge?title=${encodeURIComponent(activeTitle)}`,
          { cache: "no-store" },
        );
        const data = (await response.json()) as {
          chunks?: KnowledgeChunk[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error || "Nie udalo sie pobrac fragmentow.");
        }

        if (isActive) {
          setChunks(data.chunks ?? []);
        }
      } catch (requestError) {
        if (isActive) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Nie udalo sie pobrac fragmentow.",
          );
        }
      }
    }

    void loadChunks();
    return () => {
      isActive = false;
    };
  }, [activeTitle]);

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery || isSearching) {
      return;
    }

    setIsSearching(true);
    setError("");
    setStatus("");
    setResults([]);

    try {
      const response = await fetch("/api/knowledge-search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: trimmedQuery }),
      });
      const data = (await response.json()) as {
        results?: KnowledgeSearchResult[];
        total_found?: number;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Nie udalo sie przeszukac bazy wiedzy.");
      }

      setResults(data.results ?? []);
      setStatus(
        data.total_found
          ? `Znaleziono ${data.total_found} pasujacych fragmentow.`
          : "Nie znaleziono informacji w bazie wiedzy.",
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Nie udalo sie przeszukac bazy wiedzy.",
      );
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <main className="page app-page knowledge-page">
      <AppNav />

      <section className="knowledge-shell">
        <header className="knowledge-hero">
          <div>
            <span className="upload-kicker">Twoja baza wiedzy</span>
            <h1>Dokumenty, fragmenty i test wyszukiwania</h1>
          </div>
          <div className="upload-hero-badges">
            <span>{documents.length} dokumentow</span>
            <span>{totalChunks} fragmentow</span>
          </div>
        </header>

        <div className="knowledge-grid">
          <aside className="upload-card knowledge-doc-list">
            <div className="profile-card-head">
              <div>
                <h2>Dokumenty</h2>
                <span>{isLoading ? "Laduje..." : "Kliknij tytul, zeby zobaczyc fragmenty."}</span>
              </div>
            </div>

            {documents.length ? (
              <div className="upload-documents-list">
                {documents.map((document) => (
                  <button
                    key={document.title}
                    type="button"
                    className={`knowledge-document-button ${
                      activeTitle === document.title ? "active" : ""
                    }`}
                    onClick={() => setActiveTitle(document.title)}
                  >
                    <strong>{document.title}</strong>
                    <span>{document.chunks} fragmentow</span>
                    <small>{formatDate(document.createdAt)}</small>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state upload-empty-state">
                <p>Brak dokumentow. Dodaj je na stronie /upload.</p>
              </div>
            )}
          </aside>

          <section className="upload-card knowledge-preview">
            <div className="profile-card-head">
              <div>
                <h2>{activeTitle || "Podglad fragmentow"}</h2>
                <span>{chunks.length} fragmentow w wybranym dokumencie.</span>
              </div>
            </div>

            {chunks.length ? (
              <div className="knowledge-chunk-list">
                {chunks.map((chunk) => (
                  <article key={chunk.id} className="knowledge-chunk">
                    <div className="knowledge-chunk-meta">
                      <span>Fragment {String(chunk.metadata?.chunk_index ?? "?")}</span>
                      <span>{formatDate(chunk.createdAt)}</span>
                    </div>
                    <p>{chunk.content}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state upload-empty-state">
                <p>Wybierz dokument z listy.</p>
              </div>
            )}
          </section>
        </div>

        <section className="upload-card knowledge-search-card">
          <div className="profile-card-head">
            <div>
              <h2>Test wyszukiwania</h2>
              <span>Wpisz pytanie i sprawdz, jakie fragmenty zobaczy agent.</span>
            </div>
          </div>

          <form className="knowledge-search-form" onSubmit={handleSearch}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Szukaj w bazie wiedzy..."
              disabled={isSearching}
            />
            <button className="chat-submit" type="submit" disabled={isSearching || !query.trim()}>
              Szukaj
            </button>
          </form>

          {status ? <p className="profile-status">{status}</p> : null}
          {error ? <p className="image-feedback image-feedback-error">{error}</p> : null}

          {results.length ? (
            <div className="knowledge-result-list">
              {results.map((result, index) => (
                <article key={`${result.title}-${index}`} className="knowledge-result">
                  <div className="knowledge-chunk-meta">
                    <strong>{result.title}</strong>
                    <span>similarity {result.similarity.toFixed(3)}</span>
                  </div>
                  <p>{result.content}</p>
                  <small>Dodano: {formatDate(result.added_at)}</small>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
