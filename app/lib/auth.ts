import { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export async function getAuthenticatedUser(): Promise<User> {
  if (!supabase) throw new Error("Brak konfiguracji Supabase.");
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sesja wygasła. Zaloguj się ponownie.");
  return data.user;
}
