import type { Metadata } from "next";
import "./globals.css";
import { AuthGuard } from "./components/auth-guard";

export const metadata: Metadata = {
  title: "Marta - doradczyni podatkowa dla JDG, B2B i spółek",
  description:
    "Profesjonalny agent AI do pytań o PIT, VAT, ryczałt, koszty firmowe i rozliczenia spółek z o.o.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body><AuthGuard>{children}</AuthGuard></body>
    </html>
  );
}
