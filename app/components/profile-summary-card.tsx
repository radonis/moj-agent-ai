"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { getAuthenticatedUser } from "../lib/auth";
import { ensureProfileWithLastSeen } from "../lib/profile";

type StoredProfile = {
  id: string;
  name: string | null;
  preferences: Record<string, string> | null;
};

const summaryRows: Array<{ key: string; label: string }> = [
  { key: "miasto", label: "Miasto" },
  { key: "czym_sie_zajmuje", label: "Zajmuje sie" },
];

export function ProfileSummaryCard() {
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const [status, setStatus] = useState("Laduje profil...");

  useEffect(() => {
    let isActive = true;

    async function loadProfile() {
      if (!supabase) {
        setStatus("Brak konfiguracji Supabase.");
        return;
      }

      try {
        const user = await getAuthenticatedUser();
        const profile = await ensureProfileWithLastSeen(supabase, user.id);

        if (!isActive) return;

        setProfile((profile as StoredProfile) ?? null);
        setStatus("");
      } catch (error) {
        if (!isActive) return;
        const message = error instanceof Error ? error.message : "Nieznany blad profilu.";
        setStatus(`Nie moge wczytac profilu: ${message}`);
      }
    }

    void loadProfile();
    return () => {
      isActive = false;
    };
  }, []);

  const preferences = profile?.preferences ?? {};
  const visibleRows = summaryRows.filter((item) => preferences[item.key]);

  return (
    <article className="dashboard-card dashboard-card-profile">
      <div className="dashboard-card-head">
        <h2>Profil uzytkownika</h2>
        <span>Dane stale dla tego komputera</span>
      </div>

      {status ? <p className="dashboard-note">{status}</p> : null}

      {!status ? (
        <>
          <div className="profile-summary-name">
            <strong>{profile?.name || "Brak imienia"}</strong>
            <span>{visibleRows.length ? "Profil uzupelniony" : "Profil czeka na dane"}</span>
          </div>

          <div className="profile-summary-list">
            {visibleRows.length ? (
              visibleRows.map((item) => (
                <div key={item.key} className="profile-summary-row">
                  <span>{item.label}</span>
                  <strong>{preferences[item.key]}</strong>
                </div>
              ))
            ) : (
              <p className="dashboard-note">Uzupelnij profil, aby agent mial stabilny kontekst o Tobie.</p>
            )}
          </div>
        </>
      ) : null}

      <Link href="/profile" className="dashboard-action-link">
        Przejdz do profilu
      </Link>
    </article>
  );
}
