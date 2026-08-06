"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { ThemeToggle } from "./theme-toggle";

type NavItem = { href: string; label: string; shortLabel: string };

const primaryNavItems: NavItem[] = [
  { href: "/", label: "Dashboard", shortLabel: "Dashboard" },
  { href: "/chat", label: "Chat", shortLabel: "Chat" },
  { href: "/agent", label: "Agent", shortLabel: "Agent" },
  { href: "/travel", label: "Podróże", shortLabel: "Podróże" },
  { href: "/history", label: "Historia", shortLabel: "Historia" },
  { href: "/react", label: "ReAct", shortLabel: "ReAct" },
  { href: "/energy-market", label: "Rynek energii", shortLabel: "Energia" },
  { href: "/vision", label: "Vision", shortLabel: "Vision" },
  { href: "/think", label: "Myślenie", shortLabel: "Myślenie" },
  { href: "/search", label: "Szukaj", shortLabel: "Szukaj" },
];

const secondaryNavGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Inne",
    items: [
      { href: "/briefings", label: "Briefingi", shortLabel: "Briefingi" },
      { href: "/email-triage", label: "E-mail Triage", shortLabel: "Triage" },
      { href: "/profile", label: "Profil", shortLabel: "Profil" },
      { href: "/report", label: "Raporty", shortLabel: "Raporty" },
      { href: "/competitor", label: "Konkurencja", shortLabel: "Konkurencja" },
      { href: "/fewshot", label: "Słownik AI", shortLabel: "Słownik" },
      { href: "/format", label: "Formater", shortLabel: "Formater" },
      { href: "/extract", label: "Analizator", shortLabel: "Analizator" },
      { href: "/generate", label: "Grafiki", shortLabel: "Grafiki" },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/admin/security", label: "Bezpieczeństwo", shortLabel: "Bezpieczeństwo" },
      { href: "/admin/dashboard", label: "Użycie", shortLabel: "Użycie" },
      { href: "/upload", label: "Baza wiedzy", shortLabel: "Baza wiedzy" },
      { href: "/knowledge", label: "Podgląd wiedzy", shortLabel: "Podgląd wiedzy" },
    ],
  },
];

export const navItems = [...primaryNavItems, ...secondaryNavGroups.flatMap((group) => group.items)];

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" || pathname === "/dashboard" : pathname === href || pathname.startsWith(`${href}/`);

  useEffect(() => {
    let active = true;
    void supabase?.auth.getUser().then(({ data }) => {
      if (active) setEmail(data.user?.email ?? null);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const activeGroup = secondaryNavGroups.find((group) => group.items.some((item) => isActive(item.href)));
    if (activeGroup) {
      setExpandedGroups((groups) => (groups.includes(activeGroup.label) ? groups : [...groups, activeGroup.label]));
    }
  }, [pathname]);

  const closeMenu = () => setIsOpen(false);
  const toggleGroup = (label: string) => {
    setExpandedGroups((groups) => (groups.includes(label) ? groups.filter((group) => group !== label) : [...groups, label]));
  };

  async function signOut() {
    await supabase?.auth.signOut();
    router.replace("/login");
  }

  return (
    <>
      <button type="button" className="mobile-nav-toggle" onClick={() => setIsOpen((value) => !value)} aria-expanded={isOpen} aria-controls="mobile-navigation">
        <span>☰</span><span>Nawigacja</span>
      </button>
      {isOpen ? <button className="mobile-nav-backdrop" type="button" onClick={closeMenu} /> : null}
      <aside className={`app-nav ${isOpen ? "open" : ""}`} id="mobile-navigation">
        <div className="app-nav-brand">
          {email ? <span className="app-nav-email" title={email}>{email}</span> : null}
        </div>
        <nav className="app-nav-links" aria-label="Główna nawigacja">
          {primaryNavItems.map((item) => <NavLink key={item.href} item={item} active={isActive(item.href)} onNavigate={closeMenu} />)}
          {secondaryNavGroups.map((group) => {
            const isExpanded = expandedGroups.includes(group.label);
            const hasActiveItem = group.items.some((item) => isActive(item.href));
            return <div className="app-nav-group" key={group.label}>
              <button type="button" className={`app-nav-group-toggle ${hasActiveItem ? "active" : ""}`} onClick={() => toggleGroup(group.label)} aria-expanded={isExpanded}>
                <span>{group.label}</span><span className="app-nav-group-chevron" aria-hidden="true">⌄</span>
              </button>
              {isExpanded ? <div className="app-nav-submenu">
                {group.items.map((item) => <NavLink key={item.href} item={item} active={isActive(item.href)} onNavigate={closeMenu} />)}
              </div> : null}
            </div>;
          })}
        </nav>
        <ThemeToggle />
        <button className="secondary-button" type="button" onClick={() => void signOut()}>Wyloguj</button>
      </aside>
    </>
  );
}

function NavLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate: () => void }) {
  return <Link href={item.href} onClick={onNavigate} className={`app-nav-link ${active ? "active" : ""}`}>
    <span>{item.label}</span><small>{item.shortLabel}</small>
  </Link>;
}
