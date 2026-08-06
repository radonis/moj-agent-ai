"use client";

import Image from "next/image";
import { useState } from "react";
import { AppNav } from "../components/app-nav";

const starterPrompts = [
  "Minimalistyczne logo kawiarni w stylu japonskim",
  "Post na Instagram: kawa latte art, cieple swiatlo, widok z gory",
  "Kreacja reklamowa: wyprzedaz letnia -50%, nowoczesny design",
  "Ikona aplikacji: robot AI, gradient fioletowo-niebieski, flat design",
  "Infografika: 5 krokow do produktywnosci, pastelowe kolory",
  "Zdjecie produktowe: elegancki zegarek na ciemnym tle",
];

type GenerateImageResponse = {
  image?: string;
  text?: string;
  error?: string;
};

export default function GeneratePage() {
  const [prompt, setPrompt] = useState("");
  const [activePrompt, setActivePrompt] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function generateImage(promptToUse: string) {
    const trimmedPrompt = promptToUse.trim();
    if (!trimmedPrompt) {
      return;
    }

    setIsLoading(true);
    setError("");
    setImage(null);
    setComment("");
    setActivePrompt(trimmedPrompt);

    try {
      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: trimmedPrompt }),
      });

      const data = (await response.json()) as GenerateImageResponse;

      if (!response.ok || !data.image) {
        throw new Error(data.error || "Nie udalo sie wygenerowac obrazu.");
      }

      setImage(data.image);
      setComment(data.text || "Obraz wygenerowany.");
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Wystapil nieznany blad podczas generowania.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await generateImage(prompt);
  }

  function handleDownload() {
    if (!image) {
      return;
    }

    const link = document.createElement("a");
    link.href = image;
    link.download = "ai-generated.png";
    link.click();
  }

  return (
    <main className="page page-scroll app-page">
      <AppNav />
      <section className="chat-shell image-generator-shell">

        <header className="chat-header">
          <h1>🎨 Generator grafik AI</h1>
          <p>Opisz co chcesz - AI stworzy obraz w kilka sekund.</p>
          <div className="starter-grid">
            {starterPrompts.map((starterPrompt) => (
              <button
                key={starterPrompt}
                className="starter-button"
                type="button"
                onClick={() => setPrompt(starterPrompt)}
                disabled={isLoading}
              >
                {starterPrompt}
              </button>
            ))}
          </div>
        </header>

        <div className="image-generator-body">
          <form className="image-generator-form" onSubmit={handleSubmit}>
            <label className="image-generator-label" htmlFor="image-prompt">
              Opis obrazu
            </label>
            <textarea
              id="image-prompt"
              className="image-generator-textarea"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Opisz obraz ktory chcesz wygenerowac..."
              rows={6}
              disabled={isLoading}
            />

            <div className="image-generator-actions">
              <button
                className="chat-submit"
                type="submit"
                disabled={isLoading || !prompt.trim()}
              >
                🎨 Generuj
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void generateImage(activePrompt || prompt)}
                disabled={isLoading || !(activePrompt || prompt).trim()}
              >
                🔄 Ponownie
              </button>
            </div>
          </form>

          <section className="image-result-panel" aria-live="polite">
            {isLoading ? (
              <div className="image-loading-card">
                <div className="image-loading-pulse" />
                <p>Generuje... (5-15 sekund)</p>
              </div>
            ) : null}

            {!isLoading && error ? (
              <div className="image-feedback image-feedback-error">{error}</div>
            ) : null}

            {!isLoading && image ? (
              <div className="generated-image-card">
                <div className="generated-image-wrap">
                  <Image
                    src={image}
                    alt={activePrompt || "Wygenerowany obraz AI"}
                    width={1024}
                    height={1024}
                    className="generated-image"
                    unoptimized
                  />
                </div>
                <p className="generated-image-comment">{comment}</p>
                <div className="image-generator-actions">
                  <button className="chat-submit" type="button" onClick={handleDownload}>
                    💾 Pobierz
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void generateImage(activePrompt)}
                    disabled={!activePrompt}
                  >
                    🔄 Ponownie
                  </button>
                </div>
              </div>
            ) : null}

            {!isLoading && !image && !error ? (
              <div className="empty-state image-empty-state">
                <p>Wklej prompt lub kliknij jeden z przykladow, aby stworzyc grafike.</p>
              </div>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}
