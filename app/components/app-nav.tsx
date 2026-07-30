"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export const navItems = [
  { href: "/briefings", label: "📬 Briefingi", shortLabel: "Briefingi" },
  { href: "/", label: "Dashboard", shortLabel: "Dashboard" },
  { href: "/profile", label: "Profil", shortLabel: "Profil" },
  { href: "/chat", label: "Chat", shortLabel: "Chat" },
  { href: "/agent", label: "Agent", shortLabel: "Agent" },
  { href: "/history", label: "Historia", shortLabel: "Historia" },
  { href: "/react", label: "ReAct", shortLabel: "ReAct" },
  { href: "/travel", label: "Podróże", shortLabel: "Podróże" },
  { href: "/email-triage", label: "📧 E-mail Triage", shortLabel: "Triage" },
  { href: "/report", label: "📊 Raporty", shortLabel: "Raporty" },
  { href: "/competitor", label: "🥊 Konkurencja", shortLabel: "Konkurencja" },
  { href: "/energy-market", label: "⚡ Rynek energii", shortLabel: "Energia" },
  { href: "/search", label: "Szukaj", shortLabel: "Szukaj" },
  { href: "/upload", label: "Baza wiedzy", shortLabel: "Upload" },
  { href: "/knowledge", label: "Podgląd wiedzy", shortLabel: "Knowledge" },
  { href: "/generate", label: "Grafiki", shortLabel: "Grafiki" },
  { href: "/vision", label: "Vision", shortLabel: "Vision" },
  { href: "/think", label: "Myślenie", shortLabel: "Myślenie" },
  { href: "/fewshot", label: "Słownik AI", shortLabel: "Słownik" },
  { href: "/format", label: "Formater", shortLabel: "Formater" },
  { href: "/extract", label: "Analizator", shortLabel: "Analizator" },
  { href: "/admin/security", label: "🛡️ Bezpieczeństwo", shortLabel: "Bezpieczeństwo" },
];
const primaryRoutes = new Set(["/", "/profile", "/chat", "/agent", "/history", "/react", "/travel"]);

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => { let active = true; void supabase?.auth.getUser().then(({ data }) => { if (active) setEmail(data.user?.email ?? null); }); return () => { active = false; }; }, []);
  const closeMenu = () => setIsOpen(false);
  const isActive = (href: string) => href === "/" ? pathname === "/" || pathname === "/dashboard" : pathname === href || pathname.startsWith(`${href}/`);
  async function signOut() { await supabase?.auth.signOut(); router.replace("/login"); }
  return <><button type="button" className="mobile-nav-toggle" onClick={() => setIsOpen((value) => !value)} aria-expanded={isOpen} aria-controls="mobile-navigation"><span>☰</span><span>Nawigacja</span></button>{isOpen ? <button className="mobile-nav-backdrop" type="button" onClick={closeMenu} /> : null}<aside className={`app-nav ${isOpen ? "open" : ""}`} id="mobile-navigation"><div className="app-nav-brand"><span className="app-nav-kicker">Radonis</span><strong>alter ego</strong>{email ? <span className="app-nav-email" title={email}>{email}</span> : null}</div><nav className="app-nav-links" aria-label="Główna nawigacja">{navItems.map((item) => <Link key={item.href} href={item.href} onClick={closeMenu} className={`app-nav-link ${isActive(item.href) ? "active" : ""} ${primaryRoutes.has(item.href) ? "app-nav-link-primary" : ""}`}><span>{item.label}</span><small>{item.shortLabel}</small></Link>)}</nav><button className="secondary-button" type="button" onClick={() => void signOut()}>Wyloguj</button></aside></>;
}
