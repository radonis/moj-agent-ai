import {
  getKnowledgeSupabaseClient,
  listKnowledgeChunks,
  listKnowledgeDocuments,
  generateEmbedding,
  vectorToPgString,
} from "../../lib/knowledge";
import { splitIntoChunks } from "../../lib/chunking";

export const runtime = "nodejs";

type UploadKnowledgeBody = {
  title?: string;
  content?: string;
};

function emitStreamLine(
  controller: ReadableStreamDefaultController<Uint8Array>,
  payload: Record<string, unknown>,
) {
  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
}

export async function GET(req: Request) {
  try {
    const title = new URL(req.url).searchParams.get("title");
    const documents = await listKnowledgeDocuments();
    const chunks = title ? await listKnowledgeChunks(title) : [];
    const totalChunks = documents.reduce((sum, document) => sum + document.chunks, 0);

    return Response.json({
      documents,
      chunks,
      total_documents: documents.length,
      total_chunks: totalChunks,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Nie udalo sie pobrac dokumentow.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title")?.trim();

  if (!title) {
    return Response.json({ error: "Parametr title jest wymagany." }, { status: 400 });
  }

  const supabase = getKnowledgeSupabaseClient();
  if (!supabase) {
    return Response.json({ error: "Brak konfiguracji Supabase." }, { status: 500 });
  }

  const { error } = await supabase.from("documents").delete().eq("title", title);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true, title });
}

export async function POST(req: Request) {
  const body = (await req.json()) as UploadKnowledgeBody;
  const title = body.title?.trim();
  const content = body.content?.trim();

  if (!title || !content) {
    return Response.json(
      { error: "Pola title i content sa wymagane." },
      { status: 400 },
    );
  }

  const supabase = getKnowledgeSupabaseClient();
  if (!supabase) {
    return Response.json({ error: "Brak konfiguracji Supabase." }, { status: 500 });
  }

  const chunks = splitIntoChunks(content);
  const addedAt = new Date().toISOString();
  if (chunks.length === 0) {
    return Response.json({ error: "Brak fragmentow do zapisania." }, { status: 400 });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        try {
          emitStreamLine(controller, {
            type: "start",
            total: chunks.length,
          });

          for (const [index, chunk] of chunks.entries()) {
            const current = index + 1;
            emitStreamLine(controller, {
              type: "progress",
              current,
              total: chunks.length,
              message: `Przetwarzam fragment ${current} z ${chunks.length}...`,
            });

            const embedding = await generateEmbedding(chunk);
            const { error } = await supabase.from("documents").insert({
              title,
              content: chunk,
              embedding: vectorToPgString(embedding),
              metadata: {
                source: title,
                chunk_index: index,
                total_chunks: chunks.length,
                added_at: addedAt,
              },
            });

            if (error) {
              throw new Error(error.message);
            }
          }

          emitStreamLine(controller, {
            type: "complete",
            success: true,
            chunks_saved: chunks.length,
          });
          controller.close();
        } catch (error) {
          emitStreamLine(controller, {
            type: "error",
            error:
              error instanceof Error
                ? error.message
                : "Nieznany blad podczas zapisu do bazy wiedzy.",
          });
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
