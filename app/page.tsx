"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

const features = [
  { icon: "🧠", title: "Pamięta Twoje rozmowy", text: "Wracaj do kontekstu bez zaczynania od zera." },
  { icon: "📚", title: "Zna Twoje dokumenty", text: "Odpowiada na podstawie wiedzy, którą mu udostępnisz." },
  { icon: "🔐", title: "Prywatne dane", text: "Twoja przestrzeń i historia rozmów są tylko dla Ciebie." },
  { icon: "⚡", title: "Działa, gdy go potrzebujesz", text: "Analizy, raporty i odpowiedzi — przez całą dobę." },
];

function ProductPreview() {
  return (
    <div className="landing-preview" aria-label="Podgląd interfejsu Mój Agent">
      <div className="landing-preview-sidebar">
        <div className="landing-preview-logo">R</div>
        <span className="landing-preview-nav active" />
        <span className="landing-preview-nav" />
        <span className="landing-preview-nav" />
        <span className="landing-preview-nav" />
      </div>
      <div className="landing-preview-content">
        <div className="landing-preview-topbar"><span>Radonis — alter ego</span><i /></div>
        <div className="landing-preview-chat">
          <div className="landing-message landing-message-user">Przygotuj podsumowanie cennika dla klienta.</div>
          <div className="landing-message landing-message-agent">
            <span className="landing-agent-label">MÓJ AGENT</span>
            Jasne. Na podstawie Twoich dokumentów przygotowałem zwięzłe porównanie pakietów i rekomendację.
            <div className="landing-preview-result"><strong>Rekomendacja: Pakiet Pro</strong><span>Najlepszy stosunek funkcji do ceny dla zespołu 5–15 osób.</span></div>
          </div>
          <div className="landing-preview-input">Napisz wiadomość… <b>↑</b></div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setCheckingSession(false);
      return;
    }

    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) window.location.replace("/dashboard");
      else setCheckingSession(false);
    });
  }, []);

  if (checkingSession) return <main className="landing-loading" aria-label="Ładowanie" />;

  return (
    <main className="landing-page">
      <div className="landing-orb landing-orb-one" />
      <div className="landing-orb landing-orb-two" />
      <nav className="landing-nav">
        <Link className="landing-brand" href="/"><span>R</span> Radonis</Link>
        <Link className="landing-nav-login" href="/login">Zaloguj się</Link>
      </nav>

      <section className="landing-hero">
        <div className="landing-copy landing-fade-in">
          <p className="landing-eyebrow"><i /> OSOBISTY AGENT AI</p>
          <h1>Twój drugi umysł<br /><em>do ważnej pracy.</em></h1>
          <p className="landing-lead">Radonis to osobisty agent AI, który rozumie Twoje zadania, korzysta z Twojej wiedzy i zamienia pomysły w gotowe rezultaty.</p>
          <div className="landing-actions">
            <Link className="landing-primary-cta" href="/login">Zacznij za darmo <span>→</span></Link>
            <a className="landing-secondary-cta" href="#demo">Zobacz jak działa <span>↓</span></a>
          </div>
          <p className="landing-note">Bez karty płatniczej · Start w 30 sekund</p>
        </div>
        <div className="landing-fade-in landing-fade-in-late"><ProductPreview /></div>
      </section>

      <section className="landing-features" aria-label="Najważniejsze możliwości">
        {features.map((feature, index) => <article className="landing-feature" key={feature.title} style={{ animationDelay: `${index * 80}ms` }}><span>{feature.icon}</span><h2>{feature.title}</h2><p>{feature.text}</p></article>)}
      </section>

      <section className="landing-demo" id="demo">
        <div><p className="landing-eyebrow"><i /> WIEDZA, KTÓRA PRACUJE</p><h2>Pytasz naturalnie.<br />Agent znajduje odpowiedź.</h2><p>Dodaj dokumenty firmy, a Radonis wykorzysta je w odpowiedziach — bez przekopywania folderów i wyszukiwania po pamięci.</p><Link href="/login" className="landing-text-link">Wypróbuj na swoich dokumentach <span>→</span></Link></div>
        <div className="landing-demo-card"><div className="landing-demo-card-head"><span>📚 Baza wiedzy</span><b>12 dokumentów</b></div><div className="landing-file"><span>PDF</span><div><strong>Cennik usług 2026</strong><small>zindeksowano przed chwilą</small></div><i>✓</i></div><div className="landing-file"><span>DOC</span><div><strong>Oferta dla klientów B2B</strong><small>zindeksowano wczoraj</small></div><i>✓</i></div><div className="landing-question">Jakie są warunki pakietu Pro?<b>↑</b></div></div>
      </section>

      <section className="landing-bottom-cta"><p>GOTOWY NA LEPSZĄ PRACĘ?</p><h2>Zacznij w 30 sekund.</h2><Link className="landing-primary-cta" href="/login">Stwórz konto za darmo <span>→</span></Link></section>
      <footer className="landing-footer"><span>© 2026 Radonis</span><span>Twój osobisty agent AI</span></footer>
    </main>
  );
}
