import { createClient } from "@supabase/supabase-js";

const DAILY_TOKEN_LIMIT = 10_000;

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Brakuje konfiguracji SUPABASE_SERVICE_ROLE_KEY dla budżetu API.");
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function startOfToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

export async function hasDailyTokenBudget(userId: string) {
  const { data, error } = await getAdminClient()
    .from("api_usage")
    .select("tokens_input, tokens_output")
    .eq("user_id", userId)
    .gte("created_at", startOfToday());

  if (error) throw error;

  const usedTokens = (data ?? []).reduce(
    (sum, row) => sum + row.tokens_input + row.tokens_output,
    0,
  );
  return { allowed: usedTokens < DAILY_TOKEN_LIMIT, usedTokens };
}

export async function logApiUsage({
  userId,
  inputTokens,
  outputTokens,
  model,
  endpoint,
}: {
  userId: string;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  model: string;
  endpoint: string;
}) {
  const { error } = await getAdminClient().from("api_usage").insert({
    user_id: userId,
    tokens_input: inputTokens ?? 0,
    tokens_output: outputTokens ?? 0,
    model,
    endpoint,
  });

  if (error) throw error;
}
