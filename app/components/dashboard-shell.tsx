"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { DashboardData } from "../lib/dashboard";
import { formatLastSeen, touchProfileActivity } from "../lib/profile";
import { supabase } from "../lib/supabase";
import { getAuthenticatedUser } from "../lib/auth";

type DashboardShellProps = {
  data: DashboardData;
};

const quickActions = [
  { href: "/travel", label: "Zaplanuj podroz" },
  { href: "/react", label: "Agent ReAct" },
  { href: "/chat", label: "Chat z agentem" },
  { href: "/think", label: "Tryb myslenia" },
  { href: "/generate", label: "Generator grafik" },
  { href: "/fewshot", label: "Slownik AI" },
];

export function DashboardShell({ data }: DashboardShellProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lastRefresh, setLastRefresh] = useState(data.generatedAt);
  const [greetingName, setGreetingName] = useState("uzytkowniku");
  const [previousLastSeen, setPreviousLastSeen] = useState<string | null>(null);

  useEffect(() => {
    setLastRefresh(data.generatedAt);
  }, [data.generatedAt]);

  useEffect(() => {
    const weatherInterval = window.setInterval(() => {
      startTransition(() => {
        router.refresh();
      });
    }, 15 * 60 * 1000);

    const ratesInterval = window.setInterval(() => {
      startTransition(() => {
        router.refresh();
      });
    }, 60 * 60 * 1000);

    return () => {
      window.clearInterval(weatherInterval);
      window.clearInterval(ratesInterval);
    };
  }, [router]);

  useEffect(() => {
    let isActive = true;

    async function loadGreetingProfile() {
      if (!supabase) {
        return;
      }

      try {
        const user = await getAuthenticatedUser();
        const result = await touchProfileActivity(supabase, user.id);
        if (!isActive) return;

        setGreetingName(result.profile.name?.trim() || "uzytkowniku");
        setPreviousLastSeen(result.previousLastSeen);
      } catch {
        if (!isActive) return;
      }
    }

    void loadGreetingProfile();
    return () => {
      isActive = false;
    };
  }, []);

  const weatherTemperature =
    typeof data.weather?.temperature === "number" ? `${data.weather.temperature}°C` : "--";
  const weatherWind =
    typeof data.weather?.windSpeed === "number" ? `${data.weather.windSpeed} km/h` : "--";
  const weatherHumidity =
    typeof data.weather?.humidity === "number" ? `${data.weather.humidity}%` : "--";

  const rateRows = useMemo(
    () =>
      data.rates.map((rate) => ({
        ...rate,
        displayRate:
          typeof rate.rate === "number"
            ? `${rate.rate.toFixed(rate.unit === "pkt" ? 2 : 4)} ${rate.unit}`
            : "brak danych",
      })),
    [data.rates],
  );

  const rateSources = useMemo(
    () => Array.from(new Set(data.rates.map((rate) => rate.source).filter(Boolean))).join(", "),
    [data.rates],
  );

  return (
    <section className="dashboard-shell">
      <header className="dashboard-hero">
        <div>
          <div className="dashboard-kicker">Centrum dowodzenia</div>
          <h1>Witaj {greetingName}. Ostatnio byles tu {formatLastSeen(previousLastSeen)}.</h1>
          <p>Dzis: {data.greetingLabel}</p>
        </div>
        <button
          type="button"
          className="dashboard-refresh"
          onClick={() =>
            startTransition(() => {
              router.refresh();
            })
          }
          disabled={isPending}
        >
          {isPending ? "Odswiezam..." : "Odswiez"}
        </button>
      </header>

      <div className="dashboard-grid">
        <article className="dashboard-card dashboard-card-weather">
          <div className="dashboard-card-head">
            <h2>Pogoda</h2>
            <span>Ostatnia aktualizacja: {data.weather?.updatedAt ?? lastRefresh}</span>
          </div>
          <strong className="dashboard-city">{data.weather?.city ?? "Warszawa"}</strong>
          <div className="dashboard-metric">{weatherTemperature}</div>
          <p>{data.weather?.description ?? "Brak danych pogodowych"}</p>
          <div className="dashboard-list">
            <div>Wiatr: {weatherWind}</div>
            <div>Wilgotnosc: {weatherHumidity}</div>
          </div>
        </article>

        <article className="dashboard-card dashboard-card-rates">
          <div className="dashboard-card-head">
            <h2>Rynki i waluty</h2>
            <span>Ostatnia aktualizacja: {lastRefresh}</span>
          </div>
          <div className="dashboard-rate-list">
            {rateRows.map((rate) => (
              <div key={rate.currency} className="dashboard-rate-row">
                <strong>{rate.label}</strong>
                <span>{rate.displayRate}</span>
              </div>
            ))}
          </div>
          <p className="dashboard-note">
            Odczyt z: {data.rates.find((rate) => rate.date)?.date ?? "--"} ({rateSources || "brak zrodla"})
          </p>
        </article>

        <article className="dashboard-card dashboard-card-holidays">
          <div className="dashboard-card-head">
            <h2>Nadchodzace swieta</h2>
            <span>Ostatnia aktualizacja: {data.holidaysUpdatedAt}</span>
          </div>
          <div className="dashboard-holiday-list">
            {data.holidays.length ? (
              data.holidays.map((holiday) => (
                <div key={holiday.date} className="dashboard-holiday-row">
                  <strong>{holiday.date}</strong>
                  <span>{holiday.localName}</span>
                </div>
              ))
            ) : (
              <p>Nie udalo sie pobrac nadchodzacych swiat.</p>
            )}
          </div>
          <p className="dashboard-note">{data.nextHolidayCountdown}</p>
        </article>

        <article className="dashboard-card dashboard-card-actions">
          <div className="dashboard-card-head">
            <h2>Szybkie akcje</h2>
            <span>Przejdz od razu do zadania</span>
          </div>
          <div className="dashboard-action-list">
            {quickActions.map((action) => (
              <Link key={action.href} href={action.href} className="dashboard-action-link">
                {action.label}
              </Link>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
