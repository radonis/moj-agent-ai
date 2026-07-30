import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Brakuje konfiguracji Supabase.");
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function isAdministrator(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const allowedEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (!token || allowedEmails.length === 0) return false;

  const client = adminClient();
  const { data, error } = await client.auth.getUser(token);
  return !error && Boolean(data.user?.email && allowedEmails.includes(data.user.email.toLowerCase()));
}

export async function GET(request: Request) {
  try {
    if (!(await isAdministrator(request))) {
      return Response.json({ error: "Brak uprawnień administratora." }, { status: 403 });
    }

    const admin = adminClient();
    const now = Date.now();
    const today = new Date(now - DAY_MS).toISOString();
    const week = new Date(now - 7 * DAY_MS).toISOString();
    const [{ data: usage, error: usageError }, { data: blocked, error: blockedError }, usersResult] =
      await Promise.all([
        admin.from("api_usage").select("user_id, tokens_input, tokens_output, created_at").gte("created_at", week),
        admin.from("message_logs").select("user_id, message, block_reason, created_at").eq("blocked", true).order("created_at", { ascending: false }).limit(30),
        admin.auth.admin.listUsers({ perPage: 1000 }),
      ]);
    if (usageError) throw usageError;
    if (blockedError) throw blockedError;
    if (usersResult.error) throw usersResult.error;

    const emailByUserId = new Map(usersResult.data.users.map((user) => [user.id, user.email ?? user.id]));
    const byUser = new Map<string, { today: number; week: number }>();
    for (const row of usage ?? []) {
      const total = row.tokens_input + row.tokens_output;
      const item = byUser.get(row.user_id) ?? { today: 0, week: 0 };
      item.week += total;
      if (new Date(row.created_at).getTime() >= now - DAY_MS) item.today += total;
      byUser.set(row.user_id, item);
    }
    const topUsers = [...byUser.entries()]
      .map(([userId, tokens]) => ({ userId, email: emailByUserId.get(userId) ?? userId, ...tokens, percent: Math.round((tokens.today / 10_000) * 100) }))
      .sort((a, b) => b.week - a.week)
      .slice(0, 5);
    const totalToday = [...byUser.values()].reduce((sum, item) => sum + item.today, 0);
    const totalWeek = [...byUser.values()].reduce((sum, item) => sum + item.week, 0);
    const recentMessages = new Map<string, number>();
    for (const row of usage ?? []) {
      if (new Date(row.created_at).getTime() >= now - 10 * 60 * 1000) {
        recentMessages.set(row.user_id, (recentMessages.get(row.user_id) ?? 0) + 1);
      }
    }
    const alerts = [
      ...topUsers.filter((user) => user.percent >= 80).map((user) => ({ type: "Budżet", text: `${user.email} wykorzystał ${user.percent}% dziennego limitu.` })),
      ...[...recentMessages.entries()].filter(([, count]) => count > 20).map(([userId, count]) => ({ type: "Aktywność", text: `${emailByUserId.get(userId) ?? userId} wysłał ${count} wiadomości w 10 minut.` })),
      ...(blocked ?? []).slice(0, 5).map((row) => ({ type: "Blokada", text: `Zablokowano wiadomość użytkownika ${emailByUserId.get(row.user_id ?? "") ?? "anonimowego"}.` })),
    ];

    return Response.json({
      blocked: (blocked ?? []).map((row) => ({ ...row, email: emailByUserId.get(row.user_id ?? "") ?? "Anonimowy" })),
      topUsers,
      alerts,
      stats: { totalToday, totalWeek, blockedCount: (blocked ?? []).length, averagePerUser: byUser.size ? Math.round(totalToday / byUser.size) : 0 },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się pobrać danych panelu.";
    return Response.json({ error: message }, { status: 500 });
  }
}
