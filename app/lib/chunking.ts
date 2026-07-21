const SENTENCE_SPLIT_REGEX = /(?<=[.!?])\s+|\n+/g;

function normalizeSentence(sentence: string) {
  return sentence.replace(/\s+/g, " ").trim();
}

function buildChunk(sentences: string[]) {
  return sentences.join(" ").trim();
}

function getOverlapSentences(sentences: string[], overlap: number) {
  const selected: string[] = [];
  let length = 0;

  for (let index = sentences.length - 1; index >= 0; index -= 1) {
    const sentence = sentences[index];
    selected.unshift(sentence);
    length += sentence.length + (selected.length > 1 ? 1 : 0);

    if (length >= overlap) {
      break;
    }
  }

  return selected;
}

export function splitIntoChunks(
  text: string,
  chunkSize: number = 500,
  overlap: number = 50,
) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const rawSentences = normalized
    .split(SENTENCE_SPLIT_REGEX)
    .map(normalizeSentence)
    .filter(Boolean);

  if (rawSentences.length === 0) {
    return [normalized.slice(0, chunkSize)];
  }

  const chunks: string[] = [];
  let currentSentences: string[] = [];

  for (const sentence of rawSentences) {
    if (sentence.length > chunkSize && currentSentences.length === 0) {
      for (let start = 0; start < sentence.length; start += Math.max(1, chunkSize - overlap)) {
        chunks.push(sentence.slice(start, start + chunkSize).trim());
      }
      continue;
    }

    const candidate = buildChunk([...currentSentences, sentence]);
    if (candidate.length <= chunkSize || currentSentences.length === 0) {
      currentSentences.push(sentence);
      continue;
    }

    chunks.push(buildChunk(currentSentences));
    currentSentences = [...getOverlapSentences(currentSentences, overlap), sentence];

    while (buildChunk(currentSentences).length > chunkSize && currentSentences.length > 1) {
      currentSentences.shift();
    }
  }

  if (currentSentences.length > 0) {
    chunks.push(buildChunk(currentSentences));
  }

  return chunks.filter(Boolean);
}
