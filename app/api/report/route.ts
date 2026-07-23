import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, isStepCount } from "ai";
import { google } from "@ai-sdk/google";
import { ChatMetadata, RequestBody, generateWithModelFallback } from "../../lib/agent";
import { calculator, currentDateTime, readWebPage, searchWikipedia } from "../../lib/tools";

export const runtime = "nodejs";
const maxSteps = 8;
const searchGroundingEnabled = process.env.ENABLE_SEARCH_GROUNDING === "true";

const system = `Jesteś profesjonalnym analitykiem biznesowym. Gdy użytkownik poda temat, autonomicznie zbierasz informacje i piszesz raport.

## TWÓJ PROCES
1. Przeanalizuj temat — co trzeba zbadać?
2. Szukaj danych: ${searchGroundingEnabled ? "Google Search, Wikipedia i strony branżowe" : "Wikipedia i wiarygodne strony branżowe dostępne przez readWebPage"}.
3. Zbierz fakty, liczby i statystyki; używaj calculator do obliczeń.
4. Napisz raport w profesjonalnym formacie.

## FORMAT RAPORTU
# 📊 Raport: [TEMAT]
Data: [dzisiejsza data]
Autor: Agent AI

## Streszczenie (Executive Summary)
[3–4 zdania — kluczowe wnioski]

## 1. Wprowadzenie
[Kontekst, dlaczego temat jest ważny]

## 2. Kluczowe dane i fakty
[Punkty z danymi i linkami do źródeł]

## 3. Analiza
[Interpretacja danych, trendy, porównania]

## 4. Wnioski i rekomendacje
[Co z tego wynika i co robić]

## Źródła
[Lista użytych źródeł z linkami]

ZASADY:
- Używaj wyłącznie danych, które możesz poprzeć źródłem.
- Przy każdym istotnym fakcie podaj link markdown do źródła.
- Bądź konkretny: liczby, daty, nazwy.
- Raport powinien mieć 500–1000 słów.
- Nie wymyślaj statystyk; gdy danych brakuje, zaznacz to wprost.`;

function formatSources(sources: Array<{ title?: string; url?: string }>) {
  const unique = sources.filter((source, index, list) => source.url && list.findIndex((item) => item.url === source.url) === index);
  if (!unique.length) return "";
  return `\n\n## Źródła dodatkowe\n${unique.map((source, index) => `${index + 1}. [${source.title?.trim() || source.url}](${source.url})`).join("\n")}`;
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const body = (await request.json()) as RequestBody;
  const messages = await convertToModelMessages(body.messages);
  const { result, resolvedModel } = await generateWithModelFallback({
    messages, system, model: "flash",
    tools: { ...(searchGroundingEnabled ? { google_search: google.tools.googleSearch({}) } : {}), readWebPage, searchWikipedia, calculator, currentDateTime },
    stopWhen: isStepCount(maxSteps),
  });
  const responseText = `${result.text}${formatSources(result.sources)}`;
  const textId = `report-${Date.now()}`;
  const metadata: ChatMetadata = { mode: "ekspert", model: "flash", resolvedModel, toolCount: result.toolCalls.length, durationMs: Date.now() - startedAt, finishReason: result.finishReason };
  const stream = createUIMessageStream({ originalMessages: body.messages, execute: ({ writer }) => {
    writer.write({ type: "start", messageMetadata: metadata }); writer.write({ type: "text-start", id: textId }); writer.write({ type: "text-delta", id: textId, delta: responseText }); writer.write({ type: "text-end", id: textId }); writer.write({ type: "finish", finishReason: result.finishReason, messageMetadata: metadata });
  }});
  return createUIMessageStreamResponse({ stream });
}
