"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setStatus("Brak konfiguracji Supabase.");
      return;
    }

    setLoading(true);
    setStatus("");
    const result = isRegistering
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (result.error) {
      setStatus(result.error.message);
      return;
    }
    if (isRegistering && !result.data.session) {
      setStatus("Konto utworzone. Potwierdz adres e-mail, a następnie się zaloguj.");
      return;
    }
    router.replace("/");
  }

  return (
    <main className="page login-page">
      <section className="upload-card upload-form-card">
        <span className="upload-kicker">Mój Agent</span>
        <h1>{isRegistering ? "Załóż konto" : "Zaloguj się"}</h1>
        <p>Twoje rozmowy i dokumenty są dostępne tylko na Twoim koncie.</p>
        <form className="profile-form" onSubmit={handleSubmit}>
          <label className="profile-field"><span>E-mail</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label className="profile-field"><span>Hasło</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required /></label>
          <button className="chat-submit" type="submit" disabled={loading}>{loading ? "Chwila..." : isRegistering ? "Zarejestruj się" : "Zaloguj się"}</button>
        </form>
        <button className="secondary-button" type="button" onClick={() => { setIsRegistering((value) => !value); setStatus(""); }}>
          {isRegistering ? "Mam już konto" : "Zarejestruj się"}
        </button>
        {status ? <p className="profile-status">{status}</p> : null}
      </section>
    </main>
  );
}
