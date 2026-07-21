import { generateEmbedding } from "../../lib/knowledge";

export const runtime = "nodejs";

type EmbedBody = {
  text?: string;
};

export async function POST(req: Request) {
  const body = (await req.json()) as EmbedBody;
  const text = body.text?.trim();

  if (!text) {
    return Response.json({ error: "Pole text jest wymagane." }, { status: 400 });
  }

  try {
    const embedding = await generateEmbedding(text);
    return Response.json({ embedding });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Nieznany blad podczas embeddingu.";
    return Response.json({ error: message }, { status: 500 });
  }
}
