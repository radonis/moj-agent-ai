import { google } from "@ai-sdk/google";
import { streamText } from "ai";

export const runtime = "nodejs";

const system = `Jesteś profesjonalnym asystentem do zarządzania pocztą.

Dla KAŻDEGO maila wykonaj:
1. 📧 KATEGORYZACJA: określ typ (zapytanie ofertowe / reklamacja / spam / informacja / prośba o spotkanie)
2. 🔴🟡🟢 PRIORYTET: Wysoki (wymaga odpowiedzi dziś) / Średni (w ciągu 3 dni) / Niski (może poczekać). Dla spamu użyj priorytetu Spam.
3. ✉️ DRAFT: Napisz krótki, profesjonalny szkic odpowiedzi (3-5 zdań). Dla spamu i newsletterów bez potrzeby odpowiedzi napisz: "Brak odpowiedzi — oznacz jako spam/archiwum."

FORMAT ODPOWIEDZI — zachowaj go dokładnie dla każdego maila:
### Mail [numer]: [krótki temat]
| Kategoria | [typ] |
| Priorytet | [🔴 Wysoki / 🟡 Średni / 🟢 Niski / ⚫ Spam] |
| Uzasadnienie | [dlaczego ten priorytet] |

**Proponowana odpowiedź:**
> [draft odpowiedzi]

---

Na końcu dodaj:
### PODSUMOWANIE
- 🔴 Pilne: [ile] maili
- 🟡 Średnie: [ile] maili
- 🟢 Niskie: [ile] maili
- ⚫ Spam: [ile] maili
- ✅ Rekomendacja: [który mail obsłużyć najpierw]`;

export async function POST(request: Request) {
  const body = (await request.json()) as { emails?: unknown };

  if (!Array.isArray(body.emails) || body.emails.length === 0 || body.emails.length > 5) {
    return Response.json(
      { error: "Wklej od 1 do 5 maili." },
      { status: 400 },
    );
  }

  const emails = body.emails
    .filter((email): email is string => typeof email === "string")
    .map((email) => email.trim())
    .filter(Boolean);

  if (emails.length === 0) {
    return Response.json({ error: "Wklej treść co najmniej jednego maila." }, { status: 400 });
  }

  const prompt = emails.map((email, index) => `MAIL ${index + 1}:\n${email}`).join("\n\n==========\n\n");
  const result = streamText({
    model: google("gemini-3.1-flash-lite"),
    system,
    prompt,
  });

  return result.toTextStreamResponse();
}
