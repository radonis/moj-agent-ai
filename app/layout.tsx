import type { Metadata } from "next";
import "./globals.css";
import { AuthGuard } from "./components/auth-guard";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? `https://${process.env.VERCEL_URL ?? "moj-agent-ai.vercel.app"}`),
  title: "Radonis — Twój osobisty agent AI",
  description: "Osobisty agent AI do zadań, raportów, analiz i pracy z wiedzą firmy.",
  manifest: "/manifest.json",
  icons: { icon: "/favicon.ico", apple: "/icon.png" },
  openGraph: { title: "Radonis — Twój osobisty agent AI", description: "Agent AI z pamięcią, bazą wiedzy i automatyzacją pracy.", images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Radonis — Twój osobisty agent AI" }] },
  twitter: { card: "summary_large_image", title: "Radonis — Twój osobisty agent AI", description: "Agent AI z pamięcią, bazą wiedzy i automatyzacją pracy.", images: ["/og-image.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pl" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('radonis-theme');if(t==='light')document.documentElement.dataset.theme='light'}catch(e){}" }} /></head><body><AuthGuard>{children}</AuthGuard></body></html>;
}
