import { tokenize } from "./tokenize";
import type { Chunk, SearchHit } from "./types";

const K1 = 1.2;
const B = 0.75;

export type Bm25Index = {
  chunks: Chunk[];
  /** Per-document term frequencies. */
  tf: Array<Map<string, number>>;
  /** Document frequency per term. */
  df: Map<string, number>;
  lengths: number[];
  avgLength: number;
};

/**
 * The searchable text for a chunk is its prose plus the metadata a user is
 * likely to phrase a query in: the page title, the section title, the platform
 * label, and the code itself. Code matters because a question is often a
 * verbatim command or a `liara.json` field name.
 */
function documentText(c: Chunk): string {
  return [
    c.pageTitle,
    c.sectionTitle ?? "",
    c.platform ?? "",
    c.text,
    c.code.map((b) => b.body).join(" "),
  ].join(" ");
}

export function buildIndex(chunks: Chunk[]): Bm25Index {
  const tf: Array<Map<string, number>> = [];
  const df = new Map<string, number>();
  const lengths: number[] = [];

  for (const c of chunks) {
    const tokens = tokenize(documentText(c));
    const counts = new Map<string, number>();
    for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const t of counts.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    tf.push(counts);
    lengths.push(tokens.length);
  }

  const total = lengths.reduce((a, b) => a + b, 0);
  return {
    chunks,
    tf,
    df,
    lengths,
    avgLength: chunks.length ? total / chunks.length : 0,
  };
}

export function queryIndex(
  index: Bm25Index,
  query: string,
  limit: number,
): SearchHit[] {
  const terms = tokenize(query);
  if (!terms.length) return [];

  const N = index.chunks.length;
  const scores = new Float64Array(N);

  for (const term of terms) {
    const df = index.df.get(term);
    if (!df) continue;
    // Standard BM25 IDF with the +1 inside the log, which keeps the value
    // positive for terms appearing in more than half the corpus.
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));

    for (let i = 0; i < N; i++) {
      const f = index.tf[i].get(term);
      if (!f) continue;
      const norm = 1 - B + (B * index.lengths[i]) / (index.avgLength || 1);
      scores[i] += idf * ((f * (K1 + 1)) / (f + K1 * norm));
    }
  }

  const hits: SearchHit[] = [];
  for (let i = 0; i < N; i++) {
    if (scores[i] > 0) hits.push({ chunk: index.chunks[i], score: scores[i] });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
