import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
const PRICE_PER_MILLION_TOKENS = 0.15;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Brakuje konfiguracji Supabase.");
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function isAdministrator(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const allowedEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  if (!token || allowedEmails.length === 0) return false;
  const { data, error } = await adminClient().auth.getUser(token);
  return !error && Boolean(data.user?.email && allowedEmails.includes(data.user.email.toLowerCase()));
}

const dateKey = (date: Date) => date.toISOString().slice(0, 10);

export async function GET(request: Request) {
  try {
    if (!(await isAdministrator(request))) return Response.json({ error: "Brak uprawnień administratora." }, { status: 403 });
    const admin = adminClient();
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6));
    const [usageResult, conversationsResult, recentResult, usersResult] = await Promise.all([
      admin.from("api_usage").select("tokens_input,tokens_output,endpoint,created_at").gte("created_at", start.toISOString()),
      admin.from("conversations").select("user_id,created_at"),
      admin.from("conversations").select("id,user_id,title,updated_at,messages(id)").order("updated_at", { ascending: false }).limit(10),
      admin.auth.admin.listUsers({ perPage: 1000 }),
    ]);
    if (usageResult.error) throw usageResult.error;
    if (conversationsResult.error) throw conversationsResult.error;
    if (recentResult.error) throw recentResult.error;
    if (usersResult.error) throw usersResult.error;
    const emailById = new Map(usersResult.data.users.map((user) => [user.id, user.email ?? user.id]));
    const days = Array.from({ length: 7 }, (_, index) => { const day = new Date(start); day.setUTCDate(start.getUTCDate() + index); return { key: dateKey(day), label: day.toLocaleDateString("pl-PL", { day: "2-digit", month: "short", timeZone: "UTC" }), tokens: 0, conversations: 0 }; });
    const dayByKey = new Map(days.map((day) => [day.key, day]));
    const endpoints = new Map<string, number>(); let tokensToday = 0; const today = dateKey(now);
    for (const row of usageResult.data ?? []) { const tokens = row.tokens_input + row.tokens_output; const key = dateKey(new Date(row.created_at)); const day = dayByKey.get(key); if (day) day.tokens += tokens; endpoints.set(row.endpoint, (endpoints.get(row.endpoint) ?? 0) + tokens); if (key === today) tokensToday += tokens; }
    for (const row of conversationsResult.data ?? []) { const day = dayByKey.get(dateKey(new Date(row.created_at))); if (day) day.conversations += 1; }
    return Response.json({
      stats: { users: new Set((conversationsResult.data ?? []).map((row) => row.user_id).filter(Boolean)).size, conversations: (conversationsResult.data ?? []).length, tokensToday, costToday: tokensToday / 1_000_000 * PRICE_PER_MILLION_TOKENS },
      days,
      endpoints: [...endpoints.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      recent: (recentResult.data ?? []).map((row) => ({ id: row.id, email: emailById.get(row.user_id ?? "") ?? "Nieznany użytkownik", title: row.title || "Nowa rozmowa", updatedAt: row.updated_at, messages: Array.isArray(row.messages) ? row.messages.length : 0 })),
      pricing: { perMillionTokens: PRICE_PER_MILLION_TOKENS },
    });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Nie udało się pobrać danych dashboardu." }, { status: 500 }); }
}
