import { SupabaseClient } from "@supabase/supabase-js";

type StoredProfile = {
  id: string;
  name: string | null;
  preferences: Record<string, string> | null;
};

export function formatLastSeen(value?: string | null) {
  if (!value) return "Brak danych";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Brak danych";

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export async function touchProfileActivity(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from("user_profiles")
    .select("id,name,preferences")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  let profile = (data as StoredProfile | null) ?? null;
  if (!profile) {
    const { data: createdProfile, error: createError } = await client
      .from("user_profiles")
      .insert({ id: userId })
      .select("id,name,preferences")
      .single();

    if (createError) {
      throw createError;
    }

    profile = createdProfile as StoredProfile;
  }

  const previousLastSeen = profile.preferences?.last_seen_at ?? null;
  const preferences = {
    ...(profile.preferences ?? {}),
    last_seen_at: new Date().toISOString(),
  };

  const { error: updateError } = await client
    .from("user_profiles")
    .update({ preferences })
    .eq("id", userId);

  if (updateError) {
    throw updateError;
  }

  return {
    profile: {
      ...profile,
      preferences,
    } satisfies StoredProfile,
    previousLastSeen,
  };
}

export async function ensureProfileWithLastSeen(client: SupabaseClient, userId: string) {
  const result = await touchProfileActivity(client, userId);
  return result.profile;
}
