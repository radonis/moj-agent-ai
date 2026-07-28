import { createClient } from "@supabase/supabase-js";
import { generateWithModelFallback } from "../../lib/agent";

export const runtime = "nodejs";

const supportedTypes = ["feedback", "alert", "order"] as const;
type WebhookType = (typeof supportedTypes)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fallbackAnalysis(type: WebhookType, data: Record<string, unknown>) {
  if (type === "feedback") {
    const rating = typeof data.rating === "number" ? data.rating : null;
    const priority = rating != null && rating <= 2 ? "wysoki" : rating != null && rating <= 3 ? "średni" : "niski";
    const sentiment = rating != null && rating <= 2 ? "negatywny" : rating != null && rating <= 3 ? "neutralny" : "pozytywny";
    return `## Analiza opinii\n- **Sentyment:** ${sentiment}\n- **Priorytet:** ${priority}\n- **Sugestia odpowiedzi:** Podziękuj za informację, przeproś za niedogodność i zaproponuj konkretny kolejny krok.`;
  }
  if (type === "alert") {
    const status = String(data.status ?? "unknown").toLowerCase();
    const severity = status === "down" || status === "critical" ? "krytyczny" : "wysoki";
    return `## Analiza alertu\n- **Poziom:** ${severity}\n- **Rekomendowana akcja:** Zweryfikuj stan usługi, powiadom dyżur techniczny i rozpocznij diagnostykę przyczyny.`;
  }
  return `## Podsumowanie zamówienia\nZamówienie zostało zarejestrowane. Zweryfikuj płatność, potwierdź klientowi przyjęcie zamówienia i przekaż je do realizacji.`;
}

export async function POST(request: Request) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "Brakuje konfiguracji WEBHOOK_SECRET w środowisku serwera." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Nieprawidłowy WEBHOOK_SECRET." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return Response.json({ error: "Brakuje konfiguracji SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });

  try {
    const body: unknown = await request.json();
    if (!isRecord(body) || !supportedTypes.includes(body.type as WebhookType) || !isRecord(body.data)) {
      return Response.json({ error: "Podaj JSON: { type: feedback|alert|order, data: { ... } }." }, { status: 400 });
    }

    const type = body.type as WebhookType;
    const data = body.data;
    const serializedData = JSON.stringify(data);
    if (serializedData.length > 10_000) return Response.json({ error: "Pole data jest zbyt duże (maksymalnie 10 000 znaków)." }, { status: 413 });

    const fallback = fallbackAnalysis(type, data);
    let analysis = fallback;
    try {
      const instructions: Record<WebhookType, string> = {
        feedback: "Oceń sentyment, ustal priorytet (niski/średni/wysoki) i zaproponuj krótką, empatyczną odpowiedź dla klienta.",
        alert: "Określ severity (niski/średni/wysoki/krytyczny) i podaj natychmiastową, konkretną rekomendowaną akcję.",
        order: "Potwierdź zamówienie i podaj zwięzłe podsumowanie wraz z kolejnym krokiem realizacji.",
      };
      const { result } = await generateWithModelFallback({
        messages: [{ role: "user", content: `Zdarzenie typu: ${type}\nDane JSON: ${serializedData}\n\n${instructions[type]}` }],
        system: "Jesteś operacyjnym asystentem. Analizuj wyłącznie przekazane dane; nie wymyślaj faktów. Odpowiadaj po polsku, zwięźle i w Markdown.",
        model: "flash",
      });
      if (result.text.trim()) analysis = result.text;
    } catch { /* Zapisz analizę zastępczą, gdy model jest tymczasowo niedostępny. */ }

    const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: event, error } = await admin.from("webhook_events").insert({ type, data, analysis }).select("id").single();
    if (error) throw error;
    return Response.json({ success: true, analysis, event_id: event.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się przetworzyć webhooka.";
    return Response.json({ error: message }, { status: 500 });
  }
}
