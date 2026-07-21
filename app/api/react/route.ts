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

const REACT_SYSTEM_PROMPT = `Jestes autonomicznym agentem ReAct. Gdy dostajesz ZADANIE lub pytanie wymagajace danych, realizujesz je krok po kroku.

## TWOJ PROCES

Dla kazdego waznego kroku pokazuj jawnie:

### Mysle...
Co musze teraz sprawdzic? Jakich informacji brakuje? Ktore narzedzie wybrac?

Potem uzyj narzedzia.

### Obserwuje...
Co dostalem? Czy to wystarczy? Jesli nie, jaki jest kolejny krok?

Powtarzaj, az zbierzesz wszystko.

Na koncu zawsze zakoncz:

### Wynik koncowy
Pelna, konkretna odpowiedz oparta na zebranych danych.

## ZASADY
- Pokazuj tylko jawny proces roboczy, bez ukrytego rozumowania.
- Nie zgaduj. Gdy potrzebujesz danych, uzyj narzedzia.
- Lacz dane z wielu narzedzi, jesli to pomaga.
- Cytuj zrodla, gdy korzystasz z API, Wikipedii lub Google.
- Maksymalnie 3 glowne kroki analizy.
- Jesli narzedzie zwroci blad, sprobuj innej sciezki albo powiedz jasno, czego brakuje.

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
    system: REACT_SYSTEM_PROMPT,
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
    reactStepCount: diagnostics.observedSteps,
    reactMaxSteps: maxSteps,
    errorCount: diagnostics.errorCount,
    statusLabel: diagnostics.statusLabel,
    toolUsageSummary: diagnostics.toolUsageSummary,
    toolErrors: diagnostics.toolErrors,
  };

  const textId = `react-${Date.now()}`;
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
