import { createClient } from "@supabase/supabase-js";
import { generateWithModelFallback } from "../../../lib/agent";

export const runtime = "nodejs";

type Weather = { city: string; temperature: number | null; description: string };
type Currency = { code: string; rate: number | null };

function weatherDescription(code?: number) {
  const descriptions: Record<number, string> = { 0: "bezchmurnie", 1: "przeważnie słonecznie", 2: "lekko pochmurnie", 3: "pochmurno", 45: "mgła", 51: "lekka mżawka", 53: "mżawka", 61: "słaby deszcz", 63: "deszcz", 65: "intensywny deszcz", 71: "opady śniegu", 80: "przelotne opady", 95: "burza" };
  return descriptions[code ?? -1] ?? "brak opisu";
}

async function getWeather(): Promise<Weather> {
  const geocoding = await fetch("https://geocoding-api.open-meteo.com/v1/search?name=Warszawa&count=1&language=pl", { signal: AbortSignal.timeout(8_000) });
  if (!geocoding.ok) throw new Error("Nie udało się pobrać lokalizacji pogody.");
  const location = (await geocoding.json()) as { results?: Array<{ latitude: number; longitude: number; name: string }> };
  const place = location.results?.[0];
  if (!place) throw new Error("Nie znaleziono Warszawy w usłudze pogodowej.");
  const forecast = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code`, { signal: AbortSignal.timeout(8_000) });
  if (!forecast.ok) throw new Error("Nie udało się pobrać pogody.");
  const data = (await forecast.json()) as { current?: { temperature_2m?: number; weather_code?: number } };
  return { city: place.name, temperature: data.current?.temperature_2m ?? null, description: weatherDescription(data.current?.weather_code) };
}

async function getCurrency(code: "EUR" | "USD"): Promise<Currency> {
  const response = await fetch(`https://api.nbp.pl/api/exchangerates/rates/a/${code}/?format=json`, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Nie udało się pobrać kursu ${code}.`);
  const data = (await response.json()) as { rates?: Array<{ mid?: number }> };
  return { code, rate: data.rates?.[0]?.mid ?? null };
}

function fallbackBriefing(date: string, day: string, weather: Weather, eur: Currency, usd: Currency) {
  const temperature = weather.temperature == null ? "brak odczytu" : `${weather.temperature}°C`;
  const rate = (currency: Currency) => currency.rate == null ? "brak odczytu" : `${currency.rate.toFixed(4)} PLN`;
  return `# ☀️ Dzień dobry! Twój briefing na ${date}\n\n## 🌤️ Pogoda\n${weather.city}: **${temperature}**, ${weather.description}. Dopasuj ubiór do aktualnej temperatury i warunków za oknem.\n\n## 💶 Kursy walut\n- EUR: **${rate(eur)}**\n- USD: **${rate(usd)}**\n\n## 📅 Dzisiejszy dzień\n- Dzień tygodnia: **${day}**\n\n## 💡 Porada dnia\nZacznij od jednej najważniejszej rzeczy — mały, konkretny krok rano ułatwia dobry rytm całego dnia.`;
}

async function isAuthorized(request: Request) {
  const authorization = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authorization === `Bearer ${cronSecret}`) return true;
  if (!authorization?.startsWith("Bearer ")) return false;
  const token = authorization.slice(7);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return false;
  const client = createClient(url, key);
  const { data } = await client.auth.getUser(token);
  return Boolean(data.user);
}

export async function GET(request: Request) {
  if (!(await isAuthorized(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return Response.json({ error: "Brakuje konfiguracji SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });

  try {
    const now = new Date();
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(now);
    const formattedDate = new Intl.DateTimeFormat("pl-PL", { dateStyle: "long", timeZone: "Europe/Warsaw" }).format(now);
    const day = new Intl.DateTimeFormat("pl-PL", { weekday: "long", timeZone: "Europe/Warsaw" }).format(now);
    const [weather, eur, usd] = await Promise.all([getWeather(), getCurrency("EUR"), getCurrency("USD")]);
    const fallback = fallbackBriefing(formattedDate, day, weather, eur, usd);
    let content = fallback;
    try {
      const prompt = `Przygotuj po polsku krótki poranny briefing w Markdown. Użyj wyłącznie tych danych: data: ${formattedDate}; dzień: ${day}; pogoda w ${weather.city}: ${weather.temperature ?? "brak"}°C, ${weather.description}; EUR: ${eur.rate ?? "brak"} PLN; USD: ${usd.rate ?? "brak"} PLN. Zastosuj nagłówki: Pogoda, Kursy walut, Dzisiejszy dzień, Porada dnia. Nie wymyślaj danych.`;
      const { result } = await generateWithModelFallback({ messages: [{ role: "user", content: prompt }], system: "Jesteś osobistym asystentem przygotowującym rzetelne, zwięzłe poranne briefingi.", model: "flash" });
      if (result.text.trim()) content = result.text;
    } catch { /* Dane i briefing zastępczy są wystarczające, gdy model chwilowo nie odpowiada. */ }
    const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error } = await admin.from("briefings").insert({ content, date });
    if (error) throw error;
    return Response.json({ success: true, date, preview: content.replace(/\s+/g, " ").slice(0, 150) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się wygenerować briefingu.";
    return Response.json({ error: message }, { status: 500 });
  }
}
