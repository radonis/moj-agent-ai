import { createClient } from "@supabase/supabase-js";

export const EMBEDDING_MODEL = "gemini-embedding-2";
export const EMBEDDING_DIMENSIONS = 768;

export type KnowledgeDocumentSummary = {
  title: string;
  chunks: number;
  createdAt: string | null;
};

export type KnowledgeSearchResult = {
  title: string;
  content: string;
  similarity: number;
  metadata?: Record<string, unknown> | null;
  addedAt?: string | null;
};

export type KnowledgeChunk = {
  id: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string | null;
};

function resolveGoogleApiKey() {
  return (
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_API_KEY ||
    ""
  );
}

function resolveSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  return { url, key };
}

export function getKnowledgeSupabaseClient() {
  const config = resolveSupabaseConfig();
  if (!config) {
    return null;
  }

  return createClient(config.url, config.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function generateEmbedding(text: string) {
  const apiKey = resolveGoogleApiKey();
  if (!apiKey) {
    throw new Error(
      "Brak konfiguracji klucza Google AI. Ustaw GOOGLE_GENERATIVE_AI_API_KEY.",
    );
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: `models/${EMBEDDING_MODEL}`,
        content: {
          parts: [{ text }],
        },
        output_dimensionality: EMBEDDING_DIMENSIONS,
      }),
    },
  );

  const data = (await response.json()) as {
    embedding?: {
      values?: number[];
    };
    error?: {
      message?: string;
    };
  };

  const values = data.embedding?.values;
  if (!response.ok || !values?.length) {
    throw new Error(data.error?.message || "Nie udalo sie wygenerowac embeddingu.");
  }

  return values;
}

export function vectorToPgString(values: number[]) {
  return `[${values.join(",")}]`;
}

export async function listKnowledgeDocuments() {
  const supabase = getKnowledgeSupabaseClient();
  if (!supabase) {
    throw new Error("Brak konfiguracji Supabase.");
  }

  const { data, error } = await supabase
    .from("documents")
    .select("title, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const grouped = new Map<string, KnowledgeDocumentSummary>();

  for (const row of data ?? []) {
    const title = typeof row.title === "string" ? row.title : "Bez tytulu";
    const createdAt =
      typeof row.created_at === "string" || row.created_at === null ? row.created_at : null;
    const existing = grouped.get(title);

    if (!existing) {
      grouped.set(title, {
        title,
        chunks: 1,
        createdAt,
      });
      continue;
    }

    existing.chunks += 1;
    if (!existing.createdAt || (createdAt && createdAt > existing.createdAt)) {
      existing.createdAt = createdAt;
    }
  }

  return Array.from(grouped.values()).sort((left, right) =>
    (right.createdAt || "").localeCompare(left.createdAt || ""),
  );
}

export async function listKnowledgeChunks(title?: string) {
  const supabase = getKnowledgeSupabaseClient();
  if (!supabase) {
    throw new Error("Brak konfiguracji Supabase.");
  }

  let query = supabase
    .from("documents")
    .select("id,title,content,metadata,created_at")
    .order("created_at", { ascending: false });

  if (title?.trim()) {
    query = query.eq("title", title.trim());
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: typeof row.id === "string" ? row.id : `${row.title}-${row.created_at}`,
    title: typeof row.title === "string" ? row.title : "Bez tytulu",
    content: typeof row.content === "string" ? row.content : "",
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : null,
    createdAt:
      typeof row.created_at === "string" || row.created_at === null
        ? row.created_at
        : null,
  }));
}

export async function searchKnowledgeDocuments(
  query: string,
  options?: {
    matchThreshold?: number;
    matchCount?: number;
  },
) {
  const supabase = getKnowledgeSupabaseClient();
  if (!supabase) {
    throw new Error("Brak konfiguracji Supabase.");
  }

  const embedding = await generateEmbedding(query);
  const { data, error } = await supabase.rpc("match_documents", {
    query_embedding: vectorToPgString(embedding),
    match_threshold: options?.matchThreshold ?? 0.5,
    match_count: options?.matchCount ?? 5,
  });

  if (error) {
    throw new Error(error.message);
  }

  const results = ((data ?? []) as Array<Record<string, unknown>>)
    .map((row) => ({
      title: typeof row.title === "string" ? row.title : "Bez tytulu",
      content: typeof row.content === "string" ? row.content : "",
      similarity:
        typeof row.similarity === "number"
          ? row.similarity
          : Number(row.similarity ?? 0),
      metadata:
        row.metadata && typeof row.metadata === "object"
          ? (row.metadata as Record<string, unknown>)
          : null,
      addedAt:
        typeof row.created_at === "string"
          ? row.created_at
          : row.metadata &&
              typeof row.metadata === "object" &&
              "added_at" in row.metadata &&
              typeof row.metadata.added_at === "string"
            ? row.metadata.added_at
            : null,
    }))
    .filter((row) => row.content.trim().length > 0);

  return {
    results,
    totalFound: results.length,
  };
}
