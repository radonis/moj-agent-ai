export type DashboardWeather = {
  city: string;
  description: string;
  humidity: number | null;
  temperature: number | null;
  updatedAt: string;
  windSpeed: number | null;
};

export type DashboardRate = {
  currency: string;
  label: string;
  date: string | null;
  rate: number | null;
  source: string;
  unit: string;
  updatedAt: string;
};

export type DashboardHoliday = {
  date: string;
  daysUntil: number;
  localName: string;
  name: string;
};

export type DashboardData = {
  generatedAt: string;
  greetingLabel: string;
  holidays: DashboardHoliday[];
  holidaysUpdatedAt: string;
  nextHolidayCountdown: string;
  rates: DashboardRate[];
  weather: DashboardWeather | null;
};

const TIMEOUT_MS = 5000;

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

async function fetchJson<T>(url: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getWeather(city: string, updatedAt: string) {
  try {
    const geocodingUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geocodingUrl.searchParams.set("name", city);
    geocodingUrl.searchParams.set("count", "1");
    geocodingUrl.searchParams.set("language", "pl");

    const geocoding = await fetchJson<{
      results?: Array<{ latitude: number; longitude: number; name: string }>;
    }>(geocodingUrl.toString());

    const place = geocoding.results?.[0];
    if (!place) {
      return null;
    }

    const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
    weatherUrl.searchParams.set("latitude", String(place.latitude));
    weatherUrl.searchParams.set("longitude", String(place.longitude));
    weatherUrl.searchParams.set(
      "current",
      "temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code",
    );

    const weather = await fetchJson<{
      current?: {
        temperature_2m?: number;
        relative_humidity_2m?: number;
        weather_code?: number;
        wind_speed_10m?: number;
      };
    }>(weatherUrl.toString());

    return {
      city: place.name,
      description: weatherDescriptionFromCode(weather.current?.weather_code),
      humidity: weather.current?.relative_humidity_2m ?? null,
      temperature: weather.current?.temperature_2m ?? null,
      updatedAt,
      windSpeed: weather.current?.wind_speed_10m ?? null,
    } satisfies DashboardWeather;
  } catch {
    return null;
  }
}

async function getExchangeRate(currency: string, updatedAt: string) {
  try {
    const data = await fetchJson<{
      code: string;
      rates?: Array<{ effectiveDate: string; mid: number }>;
    }>(`https://api.nbp.pl/api/exchangerates/rates/a/${currency}/?format=json`);

    return {
      currency: data.code,
      label: data.code,
      date: data.rates?.[0]?.effectiveDate ?? null,
      rate: data.rates?.[0]?.mid ?? null,
      source: "NBP",
      unit: "PLN",
      updatedAt,
    } satisfies DashboardRate;
  } catch {
    return {
      currency,
      label: currency,
      date: null,
      rate: null,
      source: "NBP",
      unit: "PLN",
      updatedAt,
    } satisfies DashboardRate;
  }
}

async function getBitcoinRate(updatedAt: string) {
  try {
    const data = await fetchJson<{
      bitcoin?: { pln?: number; last_updated_at?: number };
    }>(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=pln&include_last_updated_at=true",
    );

    return {
      currency: "BTC",
      label: "Bitcoin",
      date: data.bitcoin?.last_updated_at
        ? new Date(data.bitcoin.last_updated_at * 1000).toISOString().slice(0, 10)
        : null,
      rate: data.bitcoin?.pln ?? null,
      source: "CoinGecko",
      unit: "PLN",
      updatedAt,
    } satisfies DashboardRate;
  } catch {
    return {
      currency: "BTC",
      label: "Bitcoin",
      date: null,
      rate: null,
      source: "CoinGecko",
      unit: "PLN",
      updatedAt,
    } satisfies DashboardRate;
  }
}

async function getWigIndex(updatedAt: string) {
  try {
    const data = await fetchJson<{
      chart?: {
        result?: Array<{
          meta?: {
            regularMarketPrice?: number;
            regularMarketTime?: number;
          };
        }>;
      };
    }>("https://query1.finance.yahoo.com/v8/finance/chart/WIG.WA?interval=1d&range=5d");

    const meta = data.chart?.result?.[0]?.meta;

    return {
      currency: "WIG",
      label: "WIG",
      date: meta?.regularMarketTime
        ? new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10)
        : null,
      rate: meta?.regularMarketPrice ?? null,
      source: "Yahoo Finance",
      unit: "pkt",
      updatedAt,
    } satisfies DashboardRate;
  } catch {
    return {
      currency: "WIG",
      label: "WIG",
      date: null,
      rate: null,
      source: "Yahoo Finance",
      unit: "pkt",
      updatedAt,
    } satisfies DashboardRate;
  }
}

async function getUpcomingHolidays(now: Date) {
  const updatedAt = new Intl.DateTimeFormat("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
  }).format(now);

  try {
    const data = await fetchJson<
      Array<{ date: string; localName: string; name: string }>
    >(`https://date.nager.at/api/v3/publicholidays/${now.getFullYear()}/PL`);

    const todayIso = now.toISOString().slice(0, 10);
    const upcoming = data
      .filter((holiday) => holiday.date >= todayIso)
      .map((holiday) => {
        const holidayDate = new Date(`${holiday.date}T00:00:00`);
        const diffMs = holidayDate.getTime() - new Date(`${todayIso}T00:00:00`).getTime();
        return {
          date: holiday.date,
          daysUntil: Math.max(0, Math.round(diffMs / 86400000)),
          localName: holiday.localName,
          name: holiday.name,
        } satisfies DashboardHoliday;
      })
      .slice(0, 3);

    return {
      holidays: upcoming,
      holidaysUpdatedAt: updatedAt,
      nextHolidayCountdown: upcoming.length
        ? `Nastepne za: ${upcoming[0].daysUntil} dni`
        : "Brak kolejnych swiat w tym roku",
    };
  } catch {
    return {
      holidays: [],
      holidaysUpdatedAt: updatedAt,
      nextHolidayCountdown: "Nie udalo sie pobrac swiat",
    };
  }
}

export async function getDashboardData(): Promise<DashboardData> {
  const now = new Date();
  const timeLabel = new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "full",
    timeZone: "Europe/Warsaw",
  }).format(now);
  const updatedAt = new Intl.DateTimeFormat("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
  }).format(now);

  const [weather, eurRate, usdRate, bitcoinRate, wigRate, holidaysInfo] = await Promise.all([
    getWeather("Warszawa", updatedAt),
    getExchangeRate("EUR", updatedAt),
    getExchangeRate("USD", updatedAt),
    getBitcoinRate(updatedAt),
    getWigIndex(updatedAt),
    getUpcomingHolidays(now),
  ]);

  return {
    generatedAt: updatedAt,
    greetingLabel: timeLabel,
    holidays: holidaysInfo.holidays,
    holidaysUpdatedAt: holidaysInfo.holidaysUpdatedAt,
    nextHolidayCountdown: holidaysInfo.nextHolidayCountdown,
    rates: [eurRate, usdRate, bitcoinRate, wigRate],
    weather,
  };
}
