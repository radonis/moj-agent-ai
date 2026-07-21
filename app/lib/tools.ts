import { tool } from "ai";
import { z } from "zod";
import { searchKnowledgeDocuments } from "./knowledge";

const WEB_PAGE_LIMIT = 3000;
const WEB_PAGE_TIMEOUT_MS = 5000;
const noteStore = new Map<string, { content: string; createdAt: string }>();

async function fetchWithTimeout(url: string | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WEB_PAGE_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function getConnectionErrorMessage(error: unknown) {
  if (error instanceof Error && error.name === "AbortError") {
    return "Timeout - serwer nie odpowiedzial w 5 sekund. Sprobuj ponownie.";
  }

  if (error instanceof Error) {
    return `Blad polaczenia: ${error.message}`;
  }

  return "Blad polaczenia: nieznany problem z siecia.";
}

function stripHtml(html: string) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeExpression(expression: string) {
  const normalized = expression.replace(/,/g, ".").replace(/\s+/g, "");
  const bannedTokens = ["import", "require", "eval", "process", "fetch"];

  if (bannedTokens.some((token) => normalized.toLowerCase().includes(token))) {
    throw new Error("Wyrazenie zawiera niedozwolone znaki");
  }

  if (!/^[0-9+\-*/().%]+$/.test(normalized)) {
    throw new Error("Dozwolone sa tylko liczby i operatory + - * / % ( ).");
  }

  return normalized.replace(/(\d+(?:\.\d+)?)%/g, "($1/100)");
}

function evaluateExpression(expression: string) {
  const sanitized = sanitizeExpression(expression);
  const result = Function(`"use strict"; return (${sanitized});`)();

  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new Error("Nie udalo sie obliczyc wyniku.");
  }

  return result;
}

function weatherDescriptionFromCode(code?: number) {
  const descriptions: Record<number, string> = {
    0: "bezchmurnie",
    1: "przewaznie slonecznie",
    2: "lekko pochmurnie",
    3: "pochmurno",
    45: "mgla",
    48: "osadzajaca sie mgla",
    51: "lekka mzawka",
    53: "umiarkowana mzawka",
    55: "intensywna mzawka",
    61: "slaby deszcz",
    63: "umiarkowany deszcz",
    65: "mocny deszcz",
    71: "slabe opady sniegu",
    73: "umiarkowane opady sniegu",
    75: "mocne opady sniegu",
    80: "przelotne opady deszczu",
    81: "silniejsze przelotne opady",
    82: "bardzo silne przelotne opady",
    95: "burza",
    96: "burza z lekkim gradem",
    99: "burza z gradem",
  };

  return descriptions[code ?? -1] ?? "brak opisu";
}

export function summarizeValue(value: unknown) {
  if (value == null) {
    return "Brak wyniku.";
  }

  if (typeof value === "string") {
    return value.length > 120 ? `${value.slice(0, 117)}...` : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `Lista wynikow: ${value.length}`;
  }

  if (typeof value === "object") {
    const preview = JSON.stringify(value);
    return preview.length > 120 ? `${preview.slice(0, 117)}...` : preview;
  }

  return "Wykonano.";
}

export function summarizeToolInput(input: unknown) {
  if (input == null) {
    return "";
  }

  if (typeof input === "string") {
    return input;
  }

  try {
    return JSON.stringify(input);
  } catch {
    return "";
  }
}

export const readWebPage = tool({
  description:
    "Pobiera i czyta zawartosc strony internetowej. Uzywaj, gdy uzytkownik poda URL lub chcesz przeczytac artykul znaleziony w wyszukiwarce.",
  inputSchema: z.object({
    url: z.string().url("Podaj pelny i poprawny adres URL."),
  }),
  execute: async ({ url }) => {
    try {
      const response = await fetchWithTimeout(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; MojAgentAI/1.0)",
        },
      });

      if (!response.ok) {
        return {
          error: `API zwrocilo blad ${response.status}. Sprawdz parametry.`,
        };
      }

      const html = await response.text();
      const text = stripHtml(html);

      if (!text) {
        return {
          error: `Nie udalo sie wyodrebnic czytelnej tresci ze strony ${url}.`,
        };
      }

      return text.slice(0, WEB_PAGE_LIMIT);
    } catch (error) {
      return { error: getConnectionErrorMessage(error) };
    }
  },
});

export const calculator = tool({
  description:
    "Oblicza wyrazenia matematyczne. Uzywaj do dokladnych obliczen, procentow i przelicznikow.",
  inputSchema: z.object({
    expression: z.string().min(1, "Podaj wyrazenie matematyczne."),
  }),
  execute: async ({ expression }) => {
    try {
      return {
        expression,
        result: evaluateExpression(expression),
      };
    } catch (error) {
      const message =
        error instanceof Error && error.message === "Wyrazenie zawiera niedozwolone znaki"
          ? error.message
          : `Nie moge obliczyc: ${expression}`;

      return {
        error: message,
      };
    }
  },
});

export const currentDateTime = tool({
  description: "Zwraca aktualna date i czas.",
  inputSchema: z.object({}),
  execute: async () => {
    const now = new Date();
    return {
      dateTime: new Intl.DateTimeFormat("pl-PL", {
        dateStyle: "full",
        timeStyle: "long",
        timeZone: "Europe/Warsaw",
      }).format(now),
      dayOfWeek: new Intl.DateTimeFormat("pl-PL", {
        weekday: "long",
        timeZone: "Europe/Warsaw",
      }).format(now),
      timestamp: now.toISOString(),
    };
  },
});

export const getWeather = tool({
  description: "Sprawdza aktualna pogode w podanym miescie.",
  inputSchema: z.object({
    city: z.string().min(1, "Podaj nazwe miasta"),
  }),
  execute: async ({ city }) => {
    if (!city.trim()) {
      return { error: "Podaj nazwe miasta" };
    }

    try {
      const geocodingUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
      geocodingUrl.searchParams.set("name", city);
      geocodingUrl.searchParams.set("count", "1");
      geocodingUrl.searchParams.set("language", "pl");

      const geocodingResponse = await fetchWithTimeout(geocodingUrl);
      if (!geocodingResponse.ok) {
        return { error: `API zwrocilo blad ${geocodingResponse.status}. Sprawdz parametry.` };
      }

      const geocodingData = (await geocodingResponse.json()) as {
        results?: Array<{
          latitude: number;
          longitude: number;
          name: string;
          country?: string;
        }>;
      };

      const place = geocodingData.results?.[0];
      if (!place) {
        return { error: `Nie znalazlem miasta ${city}. Sprawdz pisownie.` };
      }

      const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
      weatherUrl.searchParams.set("latitude", String(place.latitude));
      weatherUrl.searchParams.set("longitude", String(place.longitude));
      weatherUrl.searchParams.set(
        "current",
        "temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code",
      );

      const weatherResponse = await fetchWithTimeout(weatherUrl);
      if (!weatherResponse.ok) {
        return { error: `API zwrocilo blad ${weatherResponse.status}. Sprawdz parametry.` };
      }

      const weatherData = (await weatherResponse.json()) as {
        current?: {
          temperature_2m?: number;
          relative_humidity_2m?: number;
          wind_speed_10m?: number;
          weather_code?: number;
        };
      };

      return {
        city: place.name,
        temperature: weatherData.current?.temperature_2m ?? null,
        humidity: weatherData.current?.relative_humidity_2m ?? null,
        windSpeed: weatherData.current?.wind_speed_10m ?? null,
        description: weatherDescriptionFromCode(weatherData.current?.weather_code),
      };
    } catch (error) {
      return { error: getConnectionErrorMessage(error) };
    }
  },
});

export const getExchangeRate = tool({
  description: "Sprawdza kurs waluty do PLN z NBP.",
  inputSchema: z.object({
    currency: z.string().min(3, "Podaj 3-literowy kod waluty (np. EUR, USD)").max(3),
  }),
  execute: async ({ currency }) => {
    const normalizedCurrency = currency.toUpperCase();

    if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
      return { error: "Podaj 3-literowy kod waluty (np. EUR, USD)" };
    }

    try {
      const response = await fetchWithTimeout(
        `https://api.nbp.pl/api/exchangerates/rates/a/${normalizedCurrency}/?format=json`,
      );

      if (response.status === 404) {
        return {
          error: `Waluta ${normalizedCurrency} nie jest w tabeli NBP. Popularne: EUR, USD, GBP, CHF`,
        };
      }

      if (!response.ok) {
        return { error: `API zwrocilo blad ${response.status}. Sprawdz parametry.` };
      }

      const data = (await response.json()) as {
        code: string;
        rates?: Array<{ mid: number; effectiveDate: string }>;
      };

      return {
        currency: data.code,
        rate: data.rates?.[0]?.mid ?? null,
        date: data.rates?.[0]?.effectiveDate ?? null,
        source: "NBP",
      };
    } catch (error) {
      return { error: getConnectionErrorMessage(error) };
    }
  },
});

export const getHolidays = tool({
  description: "Sprawdza swieta panstwowe w danym kraju na dany rok.",
  inputSchema: z.object({
    countryCode: z.string().min(2, "Podaj 2-literowy kod kraju (np. PL, DE, US)").max(2),
    year: z.number().int().min(1900).max(2100),
  }),
  execute: async ({ countryCode, year }) => {
    const normalizedCountryCode = countryCode.toUpperCase();
    if (!/^[A-Z]{2}$/.test(normalizedCountryCode)) {
      return { error: "Podaj 2-literowy kod kraju (np. PL, DE, US)" };
    }

    try {
      const response = await fetchWithTimeout(
        `https://date.nager.at/api/v3/publicholidays/${year}/${normalizedCountryCode}`,
      );

      if (!response.ok) {
        return {
          error: `Nie znalazlem swiat dla kraju ${normalizedCountryCode}. Popularne: PL, DE, US, GB, FR`,
        };
      }

      const data = (await response.json()) as Array<{
        date: string;
        localName: string;
        name: string;
      }>;

      return data.slice(0, 15).map((holiday) => ({
        date: holiday.date,
        localName: holiday.localName,
        name: holiday.name,
      }));
    } catch (error) {
      return { error: getConnectionErrorMessage(error) };
    }
  },
});

export const searchWikipedia = tool({
  description: "Wyszukuje artykul w Wikipedii i zwraca streszczenie.",
  inputSchema: z.object({
    query: z.string().min(1, "Podaj temat do wyszukania."),
  }),
  execute: async ({ query }) => {
    try {
      const summaryResponse = await fetchWithTimeout(
        `https://pl.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`,
      );

      if (summaryResponse.ok) {
        const data = (await summaryResponse.json()) as {
          title?: string;
          extract?: string;
          content_urls?: { desktop?: { page?: string } };
        };

        return {
          title: data.title ?? query,
          summary: data.extract?.slice(0, 1000) ?? "",
          url:
            data.content_urls?.desktop?.page ??
            `https://pl.wikipedia.org/wiki/${encodeURIComponent(query)}`,
        };
      }

      if (summaryResponse.status !== 404) {
        return { error: `API zwrocilo blad ${summaryResponse.status}. Sprawdz parametry.` };
      }

      const searchUrl = new URL("https://pl.wikipedia.org/w/api.php");
      searchUrl.searchParams.set("action", "query");
      searchUrl.searchParams.set("list", "search");
      searchUrl.searchParams.set("srsearch", query);
      searchUrl.searchParams.set("format", "json");
      searchUrl.searchParams.set("origin", "*");

      const fallbackResponse = await fetchWithTimeout(searchUrl);
      if (!fallbackResponse.ok) {
        return { error: `API zwrocilo blad ${fallbackResponse.status}. Sprawdz parametry.` };
      }

      const fallbackData = (await fallbackResponse.json()) as {
        query?: {
          search?: Array<{
            title: string;
          }>;
        };
      };

      const firstMatch = fallbackData.query?.search?.[0];
      if (!firstMatch) {
        return { error: `Nie znalazlem artykulu Wikipedii dla ${query}` };
      }

      const secondSummaryResponse = await fetchWithTimeout(
        `https://pl.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(firstMatch.title)}`,
      );

      if (!secondSummaryResponse.ok) {
        return { error: `API zwrocilo blad ${secondSummaryResponse.status}. Sprawdz parametry.` };
      }

      const secondSummary = (await secondSummaryResponse.json()) as {
        title?: string;
        extract?: string;
        content_urls?: { desktop?: { page?: string } };
      };

      return {
        title: secondSummary.title ?? firstMatch.title,
        summary: secondSummary.extract?.slice(0, 1000) ?? "",
        url:
          secondSummary.content_urls?.desktop?.page ??
          `https://pl.wikipedia.org/wiki/${encodeURIComponent(firstMatch.title)}`,
      };
    } catch (error) {
      return { error: getConnectionErrorMessage(error) };
    }
  },
});

export const saveNote = tool({
  description: "Zapisuje notatke w pamieci agenta.",
  inputSchema: z.object({
    title: z.string().min(1, "Podaj tytul notatki."),
    content: z.string().min(1, "Podaj tresc notatki."),
  }),
  execute: async ({ title, content }) => {
    noteStore.set(title, {
      content,
      createdAt: new Date().toISOString(),
    });

    return {
      saved: true,
      title,
    };
  },
});

export const getNotes = tool({
  description: "Pobiera wszystkie zapisane notatki.",
  inputSchema: z.object({}),
  execute: async () =>
    Array.from(noteStore.entries()).map(([title, note]) => ({
      title,
      content: note.content,
      createdAt: note.createdAt,
    })),
});

export const searchKnowledge = tool({
  description:
    "Wyszukuje informacje w bazie wiedzy firmy: cenniki, oferty, FAQ, regulaminy i warunki. Uzywaj zawsze przy pytaniach o ceny, pakiety, koszty, zasady lub informacje z dokumentow firmowych.",
  inputSchema: z.object({
    query: z.string().min(1, "Podaj pytanie do wyszukania w bazie wiedzy."),
  }),
  execute: async ({ query }) => {
    try {
      const { results, totalFound } = await searchKnowledgeDocuments(query, {
        matchThreshold: 0.5,
        matchCount: 5,
      });

      if (totalFound === 0) {
        return {
          results: [],
          total_found: 0,
          source_documents: [],
          message: "Nie znaleziono informacji w bazie wiedzy.",
        };
      }

      const sourceDocuments = Array.from(
        new Set(
          results.map((result) =>
            typeof result.metadata?.source === "string" ? result.metadata.source : result.title,
          ),
        ),
      );

      return {
        results: results.map((result) => ({
          title: result.title,
          content: result.content,
          similarity: Number(result.similarity.toFixed(3)),
          metadata: result.metadata,
          added_at: result.addedAt,
        })),
        total_found: totalFound,
        source_documents: sourceDocuments,
      };
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "Nie udalo sie przeszukac bazy wiedzy.",
      };
    }
  },
});
