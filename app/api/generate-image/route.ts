import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

const IMAGE_MODEL = "gemini-3.1-flash-lite-image";
const IMAGE_TIMEOUT_MS = 30000;

type GenerateImageBody = {
  prompt?: string;
};

export type GeneratedImageResult = {
  image: string;
  text: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Nieznany blad podczas generowania obrazu.";
}

function resolveGoogleApiKey() {
  return (
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    ""
  );
}

export async function generateImageFromPrompt(
  prompt: string,
): Promise<GeneratedImageResult> {
  const apiKey = resolveGoogleApiKey();
  if (!apiKey) {
    throw new Error(
      "Brak konfiguracji klucza Google AI na serwerze. Ustaw GOOGLE_API_KEY albo GOOGLE_GENERATIVE_AI_API_KEY.",
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await Promise.race([
    ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: prompt,
      config: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    }),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("TIMEOUT")), IMAGE_TIMEOUT_MS);
    }),
  ]);

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((part) => part.inlineData?.data);
  const textPart = parts.find((part) => typeof part.text === "string" && part.text.trim());

  if (!imagePart?.inlineData?.data) {
    throw new Error("Model nie zwrocil obrazu dla podanego promptu.");
  }

  const mimeType = imagePart.inlineData.mimeType || "image/png";

  return {
    image: `data:${mimeType};base64,${imagePart.inlineData.data}`,
    text: textPart?.text?.trim() || "Obraz wygenerowany pomyslnie.",
  };
}

export async function POST(req: Request) {
  const body = (await req.json()) as GenerateImageBody;
  const prompt = body.prompt?.trim();

  if (!prompt) {
    return Response.json(
      { error: "Prompt jest wymagany." },
      { status: 400 },
    );
  }

  try {
    return Response.json(await generateImageFromPrompt(prompt));
  } catch (error) {
    const message =
      error instanceof Error && error.message === "TIMEOUT"
        ? "Przekroczono limit 30 sekund podczas generowania obrazu."
        : getErrorMessage(error);

    return Response.json(
      { error: `Nie udalo sie wygenerowac obrazu. ${message}` },
      { status: 500 },
    );
  }
}
