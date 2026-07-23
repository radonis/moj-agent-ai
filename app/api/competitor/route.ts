import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, isStepCount } from "ai";
import { google } from "@ai-sdk/google";
import { ChatMetadata, RequestBody, generateWithModelFallback } from "../../lib/agent";
import { readWebPage, searchWikipedia } from "../../lib/tools";

export const runtime = "nodejs";
const maxSteps = 10;
const searchGroundingEnabled = process.env.ENABLE_SEARCH_GROUNDING === "true";
const system = `Jesteś analitykiem konkurencji. Gdy użytkownik poda nazwy trzech firm, autonomicznie zbierasz informacje i porównujesz je.

## TWÓJ PROCES
1. Dla KAŻDEJ firmy szukaj informacji: ${searchGroundingEnabled ? "Google, Wikipedia i strony firmowe" : "Wikipedia oraz strony firmowe dostępne przez readWebPage"}.
2. Zbierz: opis, branżę, wielkość, produkty, ceny oraz mocne i słabe strony.
3. Stwórz tabelę porównawczą.
4. Napisz rekomendację uwzględniającą kontekst użytkownika.

## FORMAT
# 🟢 Analiza konkurencji

## Porównanie
| Aspekt | [Firma 1] | [Firma 2] | [Firma 3] |
|--------|-----------|-----------|-----------|
| Branża | ... | ... | ... |
| Wielkość | ... | ... | ... |
| Główny produkt | ... | ... | ... |
| Mocne strony | ... | ... | ... |
| Słabe strony | ... | ... | ... |
| Ceny (orientacyjne) | ... | ... | ... |

## Szczegółowa analiza
[Rozwinięcie dla każdej firmy — po 3–4 zdania]

## Rekomendacja
[Która firma jest najlepsza w podanym kontekście i dlaczego]

## Źródła
[Linki do stron firmowych i artykułów]

ZASADY: używaj wyłącznie danych, które możesz poprzeć źródłem; przy każdym istotnym fakcie dodaj link markdown; nie wymyślaj cen ani statystyk.`;

function formatSources(sources: Array<{ title?: string; url?: string }>) {
  const unique = sources.filter((source, index, list) => source.url && list.findIndex((item) => item.url === source.url) === index);
  return unique.length ? `\n\n## Źródła dodatkowe\n${unique.map((source, index) => `${index + 1}. [${source.title?.trim() || source.url}](${source.url})`).join("\n")}` : "";
}

export async function POST(request: Request) {
  const startedAt = Date.now(); const body = (await request.json()) as RequestBody; const messages = await convertToModelMessages(body.messages);
  const { result, resolvedModel } = await generateWithModelFallback({ messages, system, model: "flash", tools: { ...(searchGroundingEnabled ? { google_search: google.tools.googleSearch({}) } : {}), readWebPage, searchWikipedia }, stopWhen: isStepCount(maxSteps) });
  const textId = `competitor-${Date.now()}`; const responseText = `${result.text}${formatSources(result.sources)}`;
  const metadata: ChatMetadata = { mode: "ekspert", model: "flash", resolvedModel, toolCount: result.toolCalls.length, durationMs: Date.now() - startedAt, finishReason: result.finishReason };
  const stream = createUIMessageStream({ originalMessages: body.messages, execute: ({ writer }) => { writer.write({ type: "start", messageMetadata: metadata }); writer.write({ type: "text-start", id: textId }); writer.write({ type: "text-delta", id: textId, delta: responseText }); writer.write({ type: "text-end", id: textId }); writer.write({ type: "finish", finishReason: result.finishReason, messageMetadata: metadata }); } });
  return createUIMessageStreamResponse({ stream });
}
