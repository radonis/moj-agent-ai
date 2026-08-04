"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => { const savedTheme = window.localStorage.getItem("radonis-theme"); const nextTheme: Theme = savedTheme === "light" ? "light" : "dark"; document.documentElement.dataset.theme = nextTheme; setTheme(nextTheme); }, []);
  function toggleTheme() { const nextTheme: Theme = theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = nextTheme; window.localStorage.setItem("radonis-theme", nextTheme); setTheme(nextTheme); }
  return <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={theme === "dark" ? "Włącz jasny motyw" : "Włącz ciemny motyw"} title={theme === "dark" ? "Jasny motyw" : "Ciemny motyw"}>{theme === "dark" ? "☀️" : "🌙"}<span>{theme === "dark" ? "Jasny motyw" : "Ciemny motyw"}</span></button>;
}
