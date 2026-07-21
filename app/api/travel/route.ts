import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
} from "ai";
import { google } from "@ai-sdk/google";
import {
  ChatMetadata,
  RequestBody,
  generateWithModelFallback,
} from "../../lib/agent";
import {
  calculator,
  currentDateTime,
  getExchangeRate,
  getHolidays,
  getNotes,
  getWeather,
  readWebPage,
  saveNote,
  searchWikipedia,
  summarizeToolInput,
  summarizeValue,
} from "../../lib/tools";

export const runtime = "nodejs";

const maxSteps = 3;

const TRAVEL_SYSTEM_PROMPT = `Jestes profesjonalnym asystentem podrozy. Gdy uzytkownik opisuje planowana podroz, autonomicznie zbierasz wszystkie potrzebne informacje i budujesz praktyczny plan wyjazdu.

## TWOJ PROCES

Dla kazdej podrozy sprawdzaj, o ile to mozliwe:
1. Pogode w miejscu docelowym przez getWeather
2. Kurs lokalnej waluty przez getExchangeRate
3. Dni wolne i swieta w kraju docelowym przez getHolidays
4. Informacje o miescie lub atrakcjach przez searchWikipedia
5. Przeliczenie budzetu przez calculator, jesli uzytkownik poda budzet
6. Lokalne potrawy, napoje i praktyczne wskazowki restauracyjne przez searchWikipedia, google_search lub readWebPage, jesli to pomoze

Jesli uzytkownik prosi o porownanie miast, zbierz dane dla obu miejsc i przygotuj tabele porownawcza oraz rekomendacje.

Pokazuj jawny proces roboczy:

### Mysle...
Co trzeba sprawdzic i jakich danych brakuje?

### Obserwuje...
Co juz ustalilem i jaki jest kolejny krok?

Na koncu zakoncz odpowiedz w tym formacie:

## Plan podrozy: [MIASTO]

### Podsumowanie
- Destynacja: ...
- Pogoda: ...
- Waluta: ...

### Pogoda
Konkretne warunki i praktyczne wskazowki co spakowac.

### Budzet
Przeliczenia walutowe, ceny i orientacyjne koszty w PLN.

### Wazne daty
Swieta, dni wolne, ryzyka zamknietych miejsc.

### Co zobaczyc
Najwazniejsze atrakcje i szybki plan zwiedzania.

### Smaki miasta
3-5 lokalnych potraw lub napojow, czego sprobowac jako pierwsze, jakiego typu lokali lub restauracji szukac, czy rezerwacja ma sens i jak uniknac turystycznej pulapki.

### Checklist przed wyjazdem
- ...

## ZASADY
- Uzywaj prawdziwych danych z narzedzi, nie zgaduj.
- Jesli narzedzie zwroci blad, powiedz o tym i kontynuuj z pozostala wiedza.
- Badz praktyczny i konkretny.
- Podawaj przeliczenia w PLN, gdy to mozliwe.
- Przy sekcji jedzenia dawaj wskazowki w stylu: czego szukac w menu, jakiego typu lokali warto szukac i czy rezerwacja ma sens.
- Cytuj zrodla, jesli korzystasz z Google, Wikipedii lub stron WWW.
- Maksymalnie 3 glowne kroki rozumowania.

## OBSLUGA BLEDOW
- Jesli narzedzie zwroci blad, nie powtarzaj tego samego wywolania z tymi samymi argumentami dwa razy z rzedu.
- Zamiast tego poinformuj uzytkownika i zaproponuj alternatywe.
- Jesli po 3 nieudanych probach nadal brakuje danych, powiedz wprost czego brakuje.`;

function formatSources(
  sources: Array<{
    sourceType?: string;
    title?: string;
    url?: string;
  }>,
) {
  const uniqueSources = sources.filter(
    (source, index, list) =>
      source.url &&
      list.findIndex((item) => item.url === source.url) === index,
  );

  if (uniqueSources.length === 0) {
    return "";
  }

  const lines = uniqueSources.map((source, index) => {
    const title = source.title?.trim() || source.url || `Zrodlo ${index + 1}`;
    const suffix =
      source.sourceType && source.sourceType !== "url"
        ? ` (${source.sourceType})`
        : "";

    return `${index + 1}. [${title}](${source.url})${suffix}`;
  });

  return `\n\n## Zrodla\n${lines.join("\n")}`;
}

function buildDiagnostics(
  result: Awaited<ReturnType<typeof generateWithModelFallback>>["result"],
  responseText: string,
  startedAt: number,
) {
  const toolTimeline: NonNullable<ChatMetadata["toolTimeline"]> = [];
  const toolUsage = new Map<string, number>();
  const toolErrors: string[] = [];

  for (const step of result.steps) {
    for (const toolCall of step.toolCalls) {
      const matchingResult = step.toolResults.find(
        (toolResult) => toolResult.toolCallId === toolCall.toolCallId,
      );
      const output = matchingResult?.output;
      const errorMessage =
        output &&
        typeof output === "object" &&
        "error" in output &&
        typeof output.error === "string"
          ? output.error
          : null;

      toolUsage.set(toolCall.toolName, (toolUsage.get(toolCall.toolName) ?? 0) + 1);
      if (errorMessage) {
        toolErrors.push(
          `🔴 ${toolCall.toolName}(${summarizeToolInput(toolCall.input)}) - ${errorMessage}`,
        );
      }

      toolTimeline.push({
        toolName: toolCall.toolName,
        input: summarizeToolInput(toolCall.input),
        summary: matchingResult ? summarizeValue(output) : "Narzedzie uruchomione.",
        isError: Boolean(errorMessage),
        errorMessage: errorMessage ?? undefined,
      });
    }
  }

  const thoughtCount =
    responseText.match(/###\s+Mysle/gi)?.length ??
    responseText.match(/###\s+Myślę/gi)?.length ??
    0;
  const observedSteps = thoughtCount || result.steps.length || toolTimeline.length || 1;
  const toolUsageSummary = Array.from(toolUsage.entries())
    .map(([toolName, count]) => `${toolName}(${count})`)
    .join(", ");
  const statusLabel =
    result.finishReason === "length" || observedSteps >= maxSteps
      ? "⚠️ Limit krokow"
      : "✅ Ukończone";

  return {
    durationMs: Date.now() - startedAt,
    errorCount: toolErrors.length,
    observedSteps,
    statusLabel,
    toolErrors,
    toolTimeline,
    toolUsageSummary,
  };
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const body = (await req.json()) as RequestBody;
  const messages = await convertToModelMessages(body.messages);

  const { result, resolvedModel } = await generateWithModelFallback({
    messages,
    system: TRAVEL_SYSTEM_PROMPT,
    model: "flash",
    tools: {
      google_search: google.tools.googleSearch({}),
      readWebPage,
      calculator,
      currentDateTime,
      getWeather,
      getExchangeRate,
      getHolidays,
      searchWikipedia,
      saveNote,
      getNotes,
    },
    stopWhen: isStepCount(maxSteps),
  });

  const responseText = `${result.text}${formatSources(result.sources)}`;
  const diagnostics = buildDiagnostics(result, responseText, startedAt);

  const messageMetadata: ChatMetadata = {
    mode: "ekspert",
    model: "flash",
    resolvedModel,
    toolCount: result.toolCalls.length,
    durationMs: diagnostics.durationMs,
    finishReason: result.finishReason,
    toolTimeline: diagnostics.toolTimeline,
    reactMode: true,
    travelMode: true,
    reactStepCount: diagnostics.observedSteps,
    reactMaxSteps: maxSteps,
    errorCount: diagnostics.errorCount,
    statusLabel: diagnostics.statusLabel,
    toolUsageSummary: diagnostics.toolUsageSummary,
    toolErrors: diagnostics.toolErrors,
  };

  const textId = `travel-${Date.now()}`;
  const stream = createUIMessageStream({
    originalMessages: body.messages,
    execute: ({ writer }) => {
      writer.write({
        type: "start",
        messageMetadata,
      });
      writer.write({ type: "text-start", id: textId });
      writer.write({ type: "text-delta", id: textId, delta: responseText });
      writer.write({ type: "text-end", id: textId });
      writer.write({
        type: "finish",
        finishReason: result.finishReason,
        messageMetadata,
      });
    },
  });

  return createUIMessageStreamResponse({ stream });
}
