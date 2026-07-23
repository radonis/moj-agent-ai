import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, isStepCount } from "ai";
import { google } from "@ai-sdk/google";
import { ChatMetadata, RequestBody, generateWithModelFallback } from "../../lib/agent";
import { currentDateTime, readWebPage } from "../../lib/tools";

export const runtime = "nodejs";
const searchGroundingEnabled = process.env.ENABLE_SEARCH_GROUNDING === "true";
const system = `Jesteś porannym analitykiem rynku energii w Polsce. Przygotowujesz aktualny, zwięzły briefing dla analityka na początek dnia.

ŹRÓDŁA, KTÓRYM PRZYZNAJ PIERWSZEŃSTWO:
- BiznesRadar: https://www.biznesradar.pl/gielda/branza%3Aenergia%2C4%2C2
- Stooq: https://stooq.pl
- Towarowa Giełda Energii: https://tge.pl
- Barchart: https://www.barchart.com/cmdty/markets/energy
${searchGroundingEnabled ? "Użyj Google Search, aby odszukać aktualne podstrony tych źródeł." : "Google Search jest wyłączony; korzystaj z readWebPage dla wskazanych stron i wprost zaznacz brak danych, jeśli nie możesz ich potwierdzić."}

RYNKI DO MONITOROWANIA:
1. USD/PLN oraz EUR/PLN ze Stooq.
2. Węgiel API2 ARA (USD/t), gaz TTF (EUR/MWh), energia: TGE RDN i BASE Y+1 (PLN/MWh), EUA Dec (EUR/t).

ZASADY: Zawsze najpierw ustal aktualną datę. Podawaj tylko dane potwierdzone źródłem; przy braku danych wpisz "brak potwierdzonego odczytu". Nie mieszaj jednostek ani terminów dostawy. Podaj czas/dzień odczytu, jeśli jest dostępny.

FORMAT:
# ⚡ Poranny brief rynku energii
**Stan na:** [data i czas]

## Snapshot rynkowy
| Rynek | Benchmark | Ostatnie notowanie | Zmiana dzienna | Źródło |
|---|---|---:|---:|---|
| Waluty | USD/PLN | ... | ... | [Stooq](...) |
| Waluty | EUR/PLN | ... | ... | [Stooq](...) |
| Węgiel | API2 ARA | ... USD/t | ... | [źródło](...) |
| Gaz | TTF | ... EUR/MWh | ... | [źródło](...) |
| Energia | TGE RDN | ... PLN/MWh | ... | [TGE](...) |
| Energia | TGE BASE Y+1 | ... PLN/MWh | ... | [TGE](...) |
| CO₂ | EUA Dec | ... EUR/t | ... | [źródło](...) |

## Najważniejsze sygnały
- [3–5 konkretnych, źródłowych obserwacji; wskaż, co zmieniło się istotnie]

## Co obserwować dziś
- [maksymalnie 3 punkty: ryzyka, wydarzenia, poziomy/relacje cen]

## Źródła
- [pełna lista klikanych źródeł wykorzystanych w briefie]`;

export async function POST(request: Request) {
  const startedAt = Date.now(); const body = (await request.json()) as RequestBody; const messages = await convertToModelMessages(body.messages);
  const { result, resolvedModel } = await generateWithModelFallback({ messages, system, model: "flash", tools: { ...(searchGroundingEnabled ? { google_search: google.tools.googleSearch({}) } : {}), readWebPage, currentDateTime }, stopWhen: isStepCount(10) });
  const textId = `energy-${Date.now()}`; const metadata: ChatMetadata = { mode: "ekspert", model: "flash", resolvedModel, toolCount: result.toolCalls.length, durationMs: Date.now() - startedAt, finishReason: result.finishReason };
  const stream = createUIMessageStream({ originalMessages: body.messages, execute: ({ writer }) => { writer.write({ type: "start", messageMetadata: metadata }); writer.write({ type: "text-start", id: textId }); writer.write({ type: "text-delta", id: textId, delta: result.text }); writer.write({ type: "text-end", id: textId }); writer.write({ type: "finish", finishReason: result.finishReason, messageMetadata: metadata }); } });
  return createUIMessageStreamResponse({ stream });
}
