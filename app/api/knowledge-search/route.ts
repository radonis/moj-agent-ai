import { searchKnowledgeDocuments } from "../../lib/knowledge";

export const runtime = "nodejs";

type KnowledgeSearchBody = {
  query?: string;
};

function formatResults(results: Awaited<ReturnType<typeof searchKnowledgeDocuments>>["results"]) {
  const sourceDocuments = Array.from(
    new Set(
      results.map((result) =>
        typeof result.metadata?.source === "string" ? result.metadata.source : result.title,
      ),
    ),
  );

  return {
    results: results.map((result) => ({
      title: result.title,
      content: result.content,
      similarity: Number(result.similarity.toFixed(3)),
      metadata: result.metadata,
      added_at: result.addedAt,
    })),
    total_found: results.length,
    source_documents: sourceDocuments,
  };
}

export async function GET(req: Request) {
  const query = new URL(req.url).searchParams.get("query")?.trim();
  if (!query) {
    return Response.json({ error: "Parametr query jest wymagany." }, { status: 400 });
  }

  try {
    const { results } = await searchKnowledgeDocuments(query, {
      matchThreshold: 0.5,
      matchCount: 5,
    });

    return Response.json(formatResults(results));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Nie udalo sie przeszukac bazy wiedzy.",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const body = (await req.json()) as KnowledgeSearchBody;
  const query = body.query?.trim();
  if (!query) {
    return Response.json({ error: "Pole query jest wymagane." }, { status: 400 });
  }

  try {
    const { results } = await searchKnowledgeDocuments(query, {
      matchThreshold: 0.5,
      matchCount: 5,
    });

    return Response.json(formatResults(results));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Nie udalo sie przeszukac bazy wiedzy.",
      },
      { status: 500 },
    );
  }
}
