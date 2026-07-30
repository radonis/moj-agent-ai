"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return setStatus("Brak konfiguracji Supabase.");
    if (password.length < 6) return setStatus("Hasło musi mieć co najmniej 6 znaków.");
    if (password !== confirmation) return setStatus("Hasła nie są takie same.");

    setLoading(true);
    setStatus("");
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return setStatus("Link do zmiany hasła jest nieprawidłowy lub wygasł. Poproś o nowy link.");
    setStatus("Hasło zostało zmienione. Za chwilę przejdziesz do logowania.");
    window.setTimeout(() => router.replace("/login"), 1500);
  }

  return <main className="page login-page"><section className="upload-card upload-form-card"><span className="upload-kicker">Mój Agent</span><h1>Ustaw nowe hasło</h1><p>Wpisz nowe hasło dla swojego konta.</p><form className="profile-form" onSubmit={handleSubmit}><label className="profile-field"><span>Nowe hasło</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required /></label><label className="profile-field"><span>Powtórz hasło</span><input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={6} required /></label><button className="chat-submit" type="submit" disabled={loading}>{loading ? "Zmieniam..." : "Zmień hasło"}</button></form>{status ? <p className="profile-status">{status}</p> : null}</section></main>;
}
