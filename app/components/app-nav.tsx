"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "../lib/supabase";

export const navItems = [
  { href: "/", label: "Dashboard", shortLabel: "Dashboard" },
  { href: "/profile", label: "Profil", shortLabel: "Profil" },
  { href: "/chat", label: "Chat", shortLabel: "Chat" },
  { href: "/agent", label: "Agent", shortLabel: "Agent" },
  { href: "/history", label: "Historia", shortLabel: "Historia" },
  { href: "/react", label: "ReAct", shortLabel: "ReAct" },
  { href: "/travel", label: "Podroze", shortLabel: "Podroze" },
  { href: "/search", label: "Szukaj", shortLabel: "Szukaj" },
  { href: "/upload", label: "Baza wiedzy", shortLabel: "Upload" },
  { href: "/knowledge", label: "Podglad wiedzy", shortLabel: "Knowledge" },
  { href: "/generate", label: "Grafiki", shortLabel: "Grafiki" },
  { href: "/vision", label: "Vision", shortLabel: "Vision" },
  { href: "/think", label: "Myslenie", shortLabel: "Myslenie" },
  { href: "/fewshot", label: "Slownik AI", shortLabel: "Slownik" },
  { href: "/format", label: "Formater", shortLabel: "Formater" },
  { href: "/extract", label: "Analizator", shortLabel: "Analizator" },
];

const primaryRoutes = new Set(["/", "/profile", "/chat", "/agent", "/history", "/react", "/travel"]);

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  function closeMenu() {
    setIsOpen(false);
  }

  function isActive(href: string) {
    if (href === "/") {
      return pathname === "/" || pathname === "/dashboard";
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  }

  async function signOut() {
    await supabase?.auth.signOut();
    router.replace("/login");
  }

  return (
    <>
      <button
        type="button"
        className="mobile-nav-toggle"
        onClick={() => setIsOpen((value) => !value)}
        aria-expanded={isOpen}
        aria-controls="mobile-navigation"
      >
        <span>☰</span>
        <span>Nawigacja</span>
      </button>

      {isOpen ? <button className="mobile-nav-backdrop" type="button" onClick={closeMenu} /> : null}

      <aside className={`app-nav ${isOpen ? "open" : ""}`} id="mobile-navigation">
        <div className="app-nav-brand">
          <span className="app-nav-kicker">Moj Agent</span>
          <strong>Centrum dowodzenia</strong>
        </div>

        <nav className="app-nav-links" aria-label="Glowna nawigacja">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={closeMenu}
              className={`app-nav-link ${isActive(item.href) ? "active" : ""} ${
                primaryRoutes.has(item.href) ? "app-nav-link-primary" : ""
              }`}
            >
              <span>{item.label}</span>
              <small>{item.shortLabel}</small>
            </Link>
          ))}
        </nav>
        <button className="secondary-button" type="button" onClick={() => void signOut()}>
          Wyloguj
        </button>
      </aside>
    </>
  );
}
