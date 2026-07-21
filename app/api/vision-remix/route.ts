import { isStepCount, UserModelMessage } from "ai";
import { ChatImagePayload, generateWithModelFallback } from "../../lib/agent";
import { generateImageFromPrompt } from "../generate-image/route";

export const runtime = "nodejs";
const maxSteps = 3;

type VisionRemixBody = {
  image?: ChatImagePayload;
  instruction?: string;
};

export async function POST(req: Request) {
  const body = (await req.json()) as VisionRemixBody;

  if (!body.image?.dataUrl || !body.image.mediaType) {
    return Response.json(
      { error: "Obraz jest wymagany do wygenerowania podobnej wersji." },
      { status: 400 },
    );
  }

  const instruction =
    body.instruction?.trim() || "Wygeneruj podobny obraz w innym stylu.";

  try {
    const remixRequest: UserModelMessage = {
      role: "user",
      content: [
        {
          type: "file",
          mediaType: body.image.mediaType,
          filename: body.image.filename,
          data: {
            type: "url",
            url: new URL(body.image.dataUrl),
          },
        },
        {
          type: "text",
          text: `Przeanalizuj ten obraz i przygotuj jeden gotowy prompt do generatora obrazow.

Zasady:
- zachowaj glowny temat, kompozycje i najwazniejsze elementy obrazu,
- uwzglednij modyfikacje z instrukcji uzytkownika,
- prompt ma byc konkretny i gotowy do wygenerowania nowej grafiki,
- zwroc tylko prompt, bez komentarza, cudzyslowow i list.

Instrukcja uzytkownika: ${instruction}`,
        },
      ],
    };

    const { result } = await generateWithModelFallback({
      messages: [remixRequest],
      system:
        "Jestes ekspertem od prompt engineeringu dla generatorow obrazow. Tworzysz wyłącznie gotowy prompt.",
      model: "flash",
      stopWhen: isStepCount(maxSteps),
    });

    const prompt = result.text.trim();
    if (!prompt) {
      return Response.json(
        { error: "Nie udalo sie przygotowac promptu do nowej wersji obrazu." },
        { status: 500 },
      );
    }

    const generated = await generateImageFromPrompt(prompt);

    return Response.json({
      prompt,
      image: generated.image,
      text: generated.text,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Nieznany blad podczas remixu obrazu.";
    return Response.json(
      { error: `Nie udalo sie wygenerowac podobnego obrazu. ${message}` },
      { status: 500 },
    );
  }
}
