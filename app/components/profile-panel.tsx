"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AppNav } from "./app-nav";
import { supabase } from "../lib/supabase";
import { getAuthenticatedUser } from "../lib/auth";
import { ensureProfileWithLastSeen, formatLastSeen } from "../lib/profile";

type ProfileFormState = {
  name: string;
  city: string;
  company: string;
  position: string;
  profession: string;
  occupation: string;
  favoriteFood: string;
};

type StoredProfile = {
  id: string;
  name: string | null;
  preferences: Record<string, string> | null;
};

const emptyProfile: ProfileFormState = {
  name: "",
  city: "",
  company: "",
  position: "",
  profession: "",
  occupation: "",
  favoriteFood: "",
};

function toFormState(profile: StoredProfile | null): ProfileFormState {
  const preferences = profile?.preferences ?? {};

  return {
    name: profile?.name ?? "",
    city: preferences.miasto ?? "",
    company: preferences.firma ?? "",
    position: preferences.stanowisko ?? "",
    profession: preferences.zawod ?? "",
    occupation: preferences.czym_sie_zajmuje ?? "",
    favoriteFood: preferences.ulubione_jedzenie ?? "",
  };
}

function buildPreferences(state: ProfileFormState) {
  return Object.fromEntries(
    Object.entries({
      miasto: state.city.trim(),
      firma: state.company.trim(),
      stanowisko: state.position.trim(),
      zawod: state.profession.trim(),
      czym_sie_zajmuje: state.occupation.trim(),
      ulubione_jedzenie: state.favoriteFood.trim(),
    }).filter(([, value]) => value),
  );
}

export function ProfilePanel() {
  const profileIdRef = useRef<string | null>(null);
  const storedPreferencesRef = useRef<Record<string, string>>({});
  const [form, setForm] = useState<ProfileFormState>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [lastSeen, setLastSeen] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadProfile() {
      if (!supabase) {
        setStatus("Brak konfiguracji Supabase.");
        setLoading(false);
        return;
      }

      const userId = (await getAuthenticatedUser()).id;
      try {
        const profile = (await ensureProfileWithLastSeen(supabase, userId)) as StoredProfile;

        if (!isActive) return;

        profileIdRef.current = profile.id;
        storedPreferencesRef.current = profile.preferences ?? {};
        setLastSeen(profile.preferences?.last_seen_at ?? null);
        setForm(toFormState(profile));
        setStatus("");
        setLoading(false);
      } catch (error) {
        if (!isActive) return;
        const message = error instanceof Error ? error.message : "Nieznany blad profilu.";
        setStatus(`Nie moge wczytac profilu: ${message}`);
        setLoading(false);
      }
    }

    void loadProfile();
    return () => {
      isActive = false;
    };
  }, []);

  const filledFields = useMemo(
    () => Object.values(form).filter((value) => value.trim()).length,
    [form],
  );

  function updateField(key: keyof ProfileFormState) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((current) => ({ ...current, [key]: event.target.value }));
    };
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !profileIdRef.current) {
      setStatus("Profil nie jest jeszcze gotowy do zapisu.");
      return;
    }

    setSaving(true);
    const payload = {
      name: form.name.trim() || null,
      preferences: {
        ...storedPreferencesRef.current,
        ...buildPreferences(form),
      },
    };

    const { error } = await supabase
      .from("user_profiles")
      .update(payload)
      .eq("id", profileIdRef.current);

    if (error) {
      setStatus(`Nie moge zapisac profilu: ${error.message}`);
      setSaving(false);
      return;
    }

    setStatus("Profil zapisany.");
    storedPreferencesRef.current = payload.preferences;
    setLastSeen(payload.preferences.last_seen_at ?? null);
    setSaving(false);
  }

  async function handleReset() {
    if (!supabase || !profileIdRef.current) {
      setStatus("Profil nie jest jeszcze gotowy do czyszczenia.");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("user_profiles")
      .update({ name: null, preferences: { last_seen_at: new Date().toISOString() } })
      .eq("id", profileIdRef.current);

    if (error) {
      setStatus(`Nie moge wyczyscic profilu: ${error.message}`);
      setSaving(false);
      return;
    }

    setForm(emptyProfile);
    storedPreferencesRef.current = { last_seen_at: new Date().toISOString() };
    setLastSeen(storedPreferencesRef.current.last_seen_at);
    setStatus("Profil wyczyszczony.");
    setSaving(false);
  }

  return (
    <main className="page page-scroll app-page profile-page">
      <AppNav />
      <section className="profile-shell">
        <header className="profile-hero">
          <div>
            <p className="profile-kicker">Twoje dane stale</p>
            <h1>Profil uzytkownika</h1>
            <p>
              Tutaj zapisujesz informacje o sobie, z ktorych agent moze korzystac w wielu
              rozmowach na Twoim koncie.
            </p>
          </div>
          <div className="profile-hero-stats">
            <span>Uzupelnione pola: {filledFields}/7</span>
            <span>Ostatnia aktywnosc: {formatLastSeen(lastSeen)}</span>
          </div>
        </header>

        <form className="profile-card" onSubmit={handleSave}>
          <div className="profile-card-head">
            <h2>Dane podstawowe</h2>
            <span>{loading ? "Laduje..." : "Gotowe do edycji"}</span>
          </div>

          <div className="profile-grid">
            <label className="profile-field">
              <span>Imie</span>
              <input value={form.name} onChange={updateField("name")} disabled={loading || saving} />
            </label>

            <label className="profile-field">
              <span>Miasto</span>
              <input value={form.city} onChange={updateField("city")} disabled={loading || saving} />
            </label>

            <label className="profile-field">
              <span>Firma</span>
              <input value={form.company} onChange={updateField("company")} disabled={loading || saving} />
            </label>

            <label className="profile-field">
              <span>Stanowisko</span>
              <input value={form.position} onChange={updateField("position")} disabled={loading || saving} />
            </label>

            <label className="profile-field">
              <span>Zawod</span>
              <input
                value={form.profession}
                onChange={updateField("profession")}
                disabled={loading || saving}
              />
            </label>

            <label className="profile-field">
              <span>Ulubione jedzenie</span>
              <input
                value={form.favoriteFood}
                onChange={updateField("favoriteFood")}
                disabled={loading || saving}
              />
            </label>

            <label className="profile-field profile-field-wide">
              <span>Czym sie zajmuje</span>
              <textarea
                value={form.occupation}
                onChange={updateField("occupation")}
                rows={4}
                disabled={loading || saving}
              />
            </label>
          </div>

          {status ? <p className="profile-status">{status}</p> : null}

          <div className="profile-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => void handleReset()}
              disabled={loading || saving}
            >
              Wyczysc profil
            </button>
            <button className="chat-submit" type="submit" disabled={loading || saving}>
              {saving ? "Zapisuje..." : "Zapisz profil"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
