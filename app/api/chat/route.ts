import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  ModelMessage,
  tool,
  UserModelMessage,
} from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import {
  chatPrompts,
  ChatImagePayload,
  ChatMetadata,
  ChatMode,
  ChatModel,
  generateWithModelFallback,
  RequestBody,
  UserProfilePayload,
} from "../../lib/agent";
import { searchKnowledgeDocuments } from "../../lib/knowledge";
import {
  calculator,
  currentDateTime,
  readWebPage,
  searchKnowledge,
  summarizeToolInput,
  summarizeValue,
} from "../../lib/tools";
import { generateImageFromPrompt } from "../generate-image/route";
import { hasDailyTokenBudget, logApiUsage, logBlockedMessage } from "../../lib/api-usage";
import {
  BLOCKED_INPUT_MESSAGE,
  checkRateLimit,
  filterOutput,
  getCharacterTestLength,
  sanitizeInput,
  validateInput,
} from "../../lib/chat-security";

export const runtime = "nodejs";
const maxSteps = 3;
const KNOWLEDGE_QUERY_PATTERN =
  /\b(cena|ceny|cennik|koszt|kosztuje|kosztuja|pakiet|premium|basic|vip|oferta|regulamin|warunki|faq|rezygnac|subskrypc|uslug|uslug|netflix|tesla)\b/i;

function attachImageToMessages(
  messages: ModelMessage[],
  image: ChatImagePayload,
) {
  const lastUserIndex = [...messages]
    .map((message, index) => ({ message, index }))
    .reverse()
    .find((entry) => entry.message.role === "user")?.index;

  const imagePart = {
    type: "file" as const,
    mediaType: image.mediaType,
    filename: image.filename,
    data: {
      type: "url" as const,
      url: new URL(image.dataUrl),
    },
  };

  if (lastUserIndex === undefined) {
    return [
      ...messages,
      {
        role: "user",
        content: [imagePart],
      } satisfies UserModelMessage,
    ];
  }

  return messages.map((message, index) => {
    if (index !== lastUserIndex || message.role !== "user") {
      return message;
    }

    if (typeof message.content === "string") {
      return {
        ...message,
        content: [imagePart, { type: "text" as const, text: message.content }],
      };
    }

    return {
      ...message,
      content: [imagePart, ...message.content],
    };
  });
}

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

function buildPersonalizationPrompt(profile?: UserProfilePayload) {
  const profileFields = [
    ["miasto", "miasto"],
    ["firma", "firma"],
    ["stanowisko", "stanowisko"],
    ["zawod", "zawód"],
    ["czym_sie_zajmuje", "czym się zajmuje"],
    ["ulubione_jedzenie", "ulubione jedzenie"],
  ] as const;
  if (!profile?.name) {
    return "\n\nTo nowy użytkownik. Na początku pierwszej rozmowy przywitaj się krótko i zapytaj wyłącznie o imię. Gdy użytkownik je poda, odpowiedz: Miło Cię poznać, [imię]! Zapamiętam. Nie pytaj jeszcze o inne dane.";
  }

  const labels: Record<string, string> = {
    miasto: "miasto",
    firma: "firma",
    stanowisko: "stanowisko",
    zawod: "zawod",
    czym_sie_zajmuje: "czym sie zajmuje",
    ulubione_jedzenie: "ulubione jedzenie",
  };

  const preferences = Object.entries(profile.preferences ?? {})
    .filter(([, value]) => value?.trim())
    .map(([key, value]) => `${labels[key] ?? key}: ${value}`)
    .join(", ");

  const missingFields = profileFields
    .filter(([key]) => !profile.preferences?.[key]?.trim())
    .map(([, label]) => label);

  return `\n\nUżytkownik ma na imię ${profile.name}. Zwracaj się do niego po imieniu, bądź ciepły i personalny - to stały użytkownik.${preferences ? ` Zapisane dane profilu: ${preferences}. Korzystaj z nich tylko wtedy, gdy są przydatne dla odpowiedzi.` : ""}${missingFields.length ? ` Jeśli rozmowa naturalnie na to pozwala, możesz zadać jedno krótkie pytanie o JEDNĄ z brakujących danych profilu: ${missingFields.join(", ")}. Nigdy nie pytaj o dane spoza tej listy ani o kilka pól naraz.` : ""}`;
}

function getMessageText(message: RequestBody["messages"][number]) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join(" ");
}

function getLatestUserText(messages: RequestBody["messages"]) {
  return [...messages]
    .reverse()
    .find((message) => message.role === "user")
    ? getMessageText([...messages].reverse().find((message) => message.role === "user")!)
    : "";
}

function sanitizeMessages(messages: RequestBody["messages"]): RequestBody["messages"] {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) =>
      part.type === "text" ? { ...part, text: sanitizeInput(part.text) } : part,
    ),
  }));
}

function shouldSearchKnowledge(text: string) {
  return KNOWLEDGE_QUERY_PATTERN.test(text);
}

function isPriceOnlyKnowledgeQuestion(text: string) {
  const asksAboutPrice =
    /\b(ile\s+kosztuje|jaka\s+jest\s+cena|jaki\s+jest\s+koszt|cena|koszt|kosztuje)\b/i.test(
      text,
    );
  const asksForDetails =
    /\b(co\s+obejmuje|co\s+zawiera|funkcje|limity|uzytkownik|uzytkownikow|miejsce|gb|wsparcie|porownaj|roznice|regulamin|warunki|faq)\b/i.test(
      text,
    );

  return asksAboutPrice && !asksForDetails;
}

const KNOWLEDGE_QUERY_STOP_WORDS = new Set([
  "a", "baza", "bazie", "cena", "ceny", "ciepla", "co", "czy", "dla",
  "faq", "ile", "informacja", "informacje", "jest", "jaka", "jaki", "jakie",
  "koszt", "kosztuje", "mam", "model", "na", "o", "oferta", "pakiet",
  "pompa", "pomp", "pytanie", "regulamin", "sa", "sie", "sklep", "to",
  "usluga", "uslugi", "warunki", "w", "z", "ze",
]);

function normalizeKnowledgeText(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getDistinctiveQueryTerms(text: string) {
  return Array.from(
    new Set(
      normalizeKnowledgeText(text)
        .match(/[a-z0-9-]{3,}/g)
        ?.filter((term) => !KNOWLEDGE_QUERY_STOP_WORDS.has(term)) ?? [],
    ),
  );
}

function hasRelevantKnowledgeTerm(
  result: Awaited<ReturnType<typeof searchKnowledgeDocuments>>["results"][number],
  distinctiveTerms: string[],
) {
  if (distinctiveTerms.length === 0) {
    return true;
  }

  const source =
    typeof result.metadata?.source === "string" ? result.metadata.source : result.title;
  const searchableText = normalizeKnowledgeText(`${source} ${result.title} ${result.content}`);

  return distinctiveTerms.some((term) => searchableText.includes(term));
}

function selectKnowledgeResultsForAnswer(
  results: Awaited<ReturnType<typeof searchKnowledgeDocuments>>["results"],
  latestUserText: string,
) {
  // Similarity wektorowa bywa zbyt ogólna: pytanie o cenę Tesli może pasować do
  // dowolnego cennika. Jeżeli pytanie zawiera nazwę konkretnego produktu, musi
  // ona wystąpić także w znalezionym fragmencie — w przeciwnym razie odmawiamy.
  const relevantResults = results.filter((result) =>
    hasRelevantKnowledgeTerm(result, getDistinctiveQueryTerms(latestUserText)),
  );

  if (!isPriceOnlyKnowledgeQuestion(latestUserText)) {
    return relevantResults;
  }

  const preferredResult =
    relevantResults.find((result) => {
      const source =
        typeof result.metadata?.source === "string"
          ? result.metadata.source
          : result.title;

      return source.toLowerCase().includes("cennik");
    }) ?? relevantResults[0];

  return preferredResult ? [preferredResult] : [];
}

function formatKnowledgeContext(
  results: Awaited<ReturnType<typeof searchKnowledgeDocuments>>["results"],
) {
  return results
    .map((result, index) => {
      const source =
        typeof result.metadata?.source === "string" ? result.metadata.source : result.title;
      const addedAt = result.addedAt ? `, dodano: ${result.addedAt}` : "";

      return [
        `Fragment ${index + 1}`,
        `Dokument: ${source}${addedAt}`,
        `Similarity: ${result.similarity.toFixed(3)}`,
        `Tresc: ${result.content}`,
      ].join("\n");
    })
    .join("\n\n");
}

function getKnowledgeSources(
  results: Awaited<ReturnType<typeof searchKnowledgeDocuments>>["results"],
) {
  return Array.from(
    new Set(
      results.map((result) =>
        typeof result.metadata?.source === "string" ? result.metadata.source : result.title,
      ),
    ),
  );
}

function buildSingleMessageResponse({
  originalMessages,
  responseText,
  messageMetadata,
}: {
  originalMessages: RequestBody["messages"];
  responseText: string;
  messageMetadata: ChatMetadata;
}) {
  const textId = `text-${Date.now()}`;
  const stream = createUIMessageStream({
    originalMessages,
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
        finishReason: "stop",
        messageMetadata,
      });
    },
  });

  return createUIMessageStreamResponse({ stream });
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const generatedImages: NonNullable<ChatMetadata["generatedImages"]> = [];

  const body = (await req.json()) as RequestBody;
  const mode: ChatMode =
    body.mode && body.mode in chatPrompts ? body.mode : "casual";
  const model: ChatModel = body.model === "pro" ? "pro" : "flash";
  const sanitizedMessages = sanitizeMessages(body.messages);
  body.messages = sanitizedMessages;

  const securityMetadata: ChatMetadata = {
    mode,
    model,
    resolvedModel: "security",
    toolCount: 0,
    durationMs: Date.now() - startedAt,
  };
  const rateLimitKey =
    body.userProfile?.id?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "anonymous";
  const rateLimit = checkRateLimit(rateLimitKey);
  if (!rateLimit.allowed) {
    await logBlockedMessage({
      userId: body.userProfile?.id,
      message: getLatestUserText(body.messages),
      reason: "Limit wiadomości 50/h",
    }).catch((error) => console.error("Nie udało się zapisać blokady:", error));
    return buildSingleMessageResponse({
      originalMessages: body.messages,
      responseText: `Osiągnąłeś limit wiadomości (50/h). Spróbuj za ${rateLimit.retryAfterMinutes} min.`,
      messageMetadata: securityMetadata,
    });
  }

  const latestInputText = getLatestUserText(sanitizedMessages);
  const characterTestLength = getCharacterTestLength(latestInputText);
  if (characterTestLength !== null) {
    const inputCheck = validateInput("x".repeat(characterTestLength));
    return buildSingleMessageResponse({
      originalMessages: body.messages,
      responseText: inputCheck.valid
        ? `Test długości: ${characterTestLength} znaków. Wiadomość przeszłaby walidację.`
        : BLOCKED_INPUT_MESSAGE,
      messageMetadata: securityMetadata,
    });
  }

  const inputCheck = validateInput(latestInputText);
  if (!inputCheck.valid) {
    await logBlockedMessage({
      userId: body.userProfile?.id,
      message: latestInputText,
      reason: "Walidacja wejścia: długość lub zabroniona fraza",
    }).catch((error) => console.error("Nie udało się zapisać blokady:", error));
    return buildSingleMessageResponse({
      originalMessages: body.messages,
      responseText: BLOCKED_INPUT_MESSAGE,
      messageMetadata: securityMetadata,
    });
  }

  const usageUserId = body.userProfile?.id?.trim();
  if (usageUserId) {
    try {
      const budget = await hasDailyTokenBudget(usageUserId);
      if (!budget.allowed) {
        return buildSingleMessageResponse({
          originalMessages: body.messages,
          responseText: "Dzienny limit tokenów (10k) został wyczerpany. Wróć jutro!",
          messageMetadata: securityMetadata,
        });
      }
    } catch (error) {
      console.error("Nie udało się sprawdzić budżetu tokenów:", error);
      return buildSingleMessageResponse({
        originalMessages: body.messages,
        responseText: "Nie mogę teraz sprawdzić budżetu wiadomości. Spróbuj ponownie za chwilę.",
        messageMetadata: securityMetadata,
      });
    }
  }

  const generateImage = tool({
    description:
      "Generuje obraz na podstawie opisu. Uzywaj gdy uzytkownik prosi o logo, grafike, ilustracje albo post wizualny.",
    inputSchema: z.object({
      prompt: z.string().min(1, "Podaj opis obrazu."),
    }),
    execute: async ({ prompt }) => {
      const generated = await generateImageFromPrompt(prompt);
      generatedImages.push({
        title: "Wygenerowany obraz",
        image: generated.image,
        prompt,
      });

      return {
        status: "ok",
        prompt,
        note: generated.text,
      };
    },
  });

  const modelMessages = await convertToModelMessages(body.messages);
  const enrichedMessages = body.image
    ? attachImageToMessages(modelMessages, body.image)
    : modelMessages;
  const latestUserText = getLatestUserText(body.messages);
  const shouldUseKnowledge = shouldSearchKnowledge(latestUserText);
  const knowledgeToolTimeline: NonNullable<ChatMetadata["toolTimeline"]> = [];
  let knowledgeContext = "";

  if (shouldUseKnowledge) {
    const { results } = await searchKnowledgeDocuments(latestUserText, {
      matchThreshold: 0.5,
      matchCount: 5,
    });
    const resultsForAnswer = selectKnowledgeResultsForAnswer(
      results,
      latestUserText,
    );
    const sources = getKnowledgeSources(resultsForAnswer);

    knowledgeToolTimeline.push({
      toolName: "searchKnowledge",
      input: latestUserText,
      summary:
        results.length > 0
          ? `Znaleziono ${results.length} fragmentow, do odpowiedzi uzyto: ${sources.join(", ")}.`
          : "Nie znaleziono informacji w bazie wiedzy.",
    });

    if (resultsForAnswer.length === 0) {
      const messageMetadata: ChatMetadata = {
        mode,
        model,
        resolvedModel: "knowledge-search",
        toolCount: 1,
        durationMs: Date.now() - startedAt,
        toolTimeline: knowledgeToolTimeline,
      };

      return buildSingleMessageResponse({
        originalMessages: body.messages,
        responseText:
          "Nie mam informacji na ten temat w mojej bazie wiedzy. Skontaktuj sie z firma bezposrednio.",
        messageMetadata,
      });
    }

    knowledgeContext = `\n\nWYNIKI searchKnowledge DLA OSTATNIEGO PYTANIA:\n${formatKnowledgeContext(resultsForAnswer)}

Instrukcja nadrzedna dla odpowiedzi z bazy wiedzy:
- Odpowiedz tylko na dokladnie zadane pytanie, na podstawie powyzszych fragmentow.
- Jesli uzytkownik pyta tylko o cene, podaj tylko cene. Nie wymieniaj cech pakietu, limitow, rekomendacji ani dodatkowych warunkow.
- Nie dodawaj rekomendacji, porad zakupowych, personalizacji firmowej ani pytania koncowego, chyba ze uzytkownik wyraznie o to poprosi.
- Nie dolaczaj informacji z innego dokumentu tylko dlatego, ze jest dostepna, jesli nie odpowiada bezposrednio na pytanie.
- Na koncu dodaj dokladnie jedna linie: "${
      sources.length === 1 ? `Zrodlo: ${sources[0]}` : `Zrodla: ${sources.join(", ")}`
    }".`;
  }

  const { result, resolvedModel } = await generateWithModelFallback({
    messages: enrichedMessages,
    system: `${chatPrompts[mode]}${buildPersonalizationPrompt(body.userProfile)}${body.justLearnedName ? `\n\nUżytkownik właśnie podał imię ${body.justLearnedName}. Rozpocznij odpowiedź dokładnie od: "Miło Cię poznać, ${body.justLearnedName}! Zapamiętam."` : ""}

Masz dostep do prawdziwego internetu i wielu narzedzi.
- Masz dostep do bazy wiedzy firmy przez narzedzie searchKnowledge.
- Gdy uzytkownik pyta o ceny, pakiety, koszty, oferte, regulamin, warunki, FAQ lub inne informacje z dokumentow firmowych, zawsze najpierw uzyj searchKnowledge.
- W pytaniach firmowych odpowiadaj tylko na podstawie znalezionych fragmentow z bazy wiedzy.
- Gdy odpowiadasz na podstawie bazy wiedzy, na koncu odpowiedzi zawsze dodaj osobna linie: "Zrodlo: [tytul dokumentu]". Gdy korzystasz z wielu dokumentow, dodaj: "Zrodla: [tytul 1], [tytul 2]".
- Jesli searchKnowledge zwroci 0 wynikow albo brak pasujacego fragmentu, powiedz wprost: "Nie mam informacji na ten temat w mojej bazie wiedzy. Skontaktuj sie z firma bezposrednio." Nie zmyslaj i nie dopowiadaj brakujacych cen ani warunkow.
- Odmowa dotyczy tylko tematow firmowych. Pytania ogolne, pogoda, kursy walut, Wikipedia i aktualne informacje obsluguj normalnie innymi narzedziami.
- Gdy pytanie dotyczy aktualnych informacji, cen, wiadomosci, wynikow, polityki, kursow, premier albo wydarzen dziejacych sie teraz, siegnij po wyszukiwanie Google.
- Gdy uzytkownik poda URL albo poprosi o przeczytanie konkretnej strony, uzyj narzedzia readWebPage.
- Gdy uzytkownik prosi o obliczenia, VAT, procenty albo brutto/netto, uzyj calculator.
- Gdy uzytkownik pyta o aktualny czas lub date, uzyj currentDateTime.
- Gdy uzytkownik prosi o logo, grafike, ilustracje lub post wizualny, uzyj generateImage.
- Jesli korzystasz z internetu, oprzyj odpowiedz na znalezionych zrodlach i nie zmyslaj brakujacych faktow.
- Mozesz laczyc narzedzia, jesli to pomaga rozwiazac zadanie krok po kroku.${knowledgeContext}`,
    model,
    tools: {
      searchKnowledge,
      google_search: google.tools.googleSearch({}),
      readWebPage,
      calculator,
      currentDateTime,
      generateImage,
    },
    stopWhen: isStepCount(maxSteps),
  });

  const responseText = filterOutput(
    `${result.text}${formatSources(result.sources)}`,
  );
  if (usageUserId) {
    try {
      await logApiUsage({
        userId: usageUserId,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        model: resolvedModel,
        endpoint: "/api/chat",
      });
    } catch (error) {
      console.error("Nie udało się zapisać zużycia tokenów:", error);
    }
  }
  const toolTimeline: NonNullable<ChatMetadata["toolTimeline"]> = [
    ...knowledgeToolTimeline,
  ];

  for (const step of result.steps) {
    for (const toolCall of step.toolCalls) {
      const matchingResult = step.toolResults.find(
        (toolResult) => toolResult.toolCallId === toolCall.toolCallId,
      );

      toolTimeline.push({
        toolName: toolCall.toolName,
        input: summarizeToolInput(toolCall.input),
        summary:
          toolCall.toolName === "generateImage"
            ? generatedImages.at(-1)?.prompt
              ? "Obraz wygenerowany i gotowy do podgladu."
              : "Uruchomiono generator obrazu."
            : matchingResult
              ? summarizeValue(matchingResult.output)
              : "Narzędzie uruchomione.",
      });
    }
  }

  const messageMetadata: ChatMetadata = {
    mode,
    model,
    resolvedModel,
    toolCount: result.toolCalls.length + knowledgeToolTimeline.length,
    durationMs: Date.now() - startedAt,
    generatedImages,
    toolTimeline,
  };

  const textId = `text-${Date.now()}`;
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
