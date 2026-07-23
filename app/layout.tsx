import type { Metadata } from "next";
import "./globals.css";
import { AuthGuard } from "./components/auth-guard";

export const metadata: Metadata = {
  title: "Radonis - alter ego",
  description: "Osobisty agent AI do zadań, raportów i analiz.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pl"><body><AuthGuard>{children}</AuthGuard></body></html>;
}
