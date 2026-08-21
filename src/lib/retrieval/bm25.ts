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
 * likely to phrase a query in: the page title, the section title and the
 * platform label.
 *
 * `code[]` is deliberately NOT ranked on, though it still travels with the
 * chunk into the model's context. Indexing it was measured against two
 * alternatives over 17 queries: ranking code at weight 1 scored 15/17 top-1,
 * de-duplicating code terms scored 15/17, and excluding code scored 16/17
 * with no case regressing out of the top 6. Code is a magnet for false
 * positives because an incidental identifier in a sample — the literal
 * `Next.js` inside an email-server code comment — matches a question about
 * deploying Next.js as strongly as a page actually about deployment, and
 * such chunks are short, so length normalization amplifies them further.
 *
 * BM25 here has no native per-field weighting, so field importance is
 * emulated by repeating higher-value fields before concatenating everything
 * into one bag of words. Repetition raises both a field's term frequency
 * *and* the document's total length; since length normalization is global,
 * padding a chunk's title/section/prose grows its length without growing the
 * match count of a term that only occurs in `code[]`, which pushes that
 * term's contribution down relative to chunks that genuinely match in prose.
 *
 * Weights (title 4x, section 3x, prose 2x, platform/code 1x) were chosen by
 * measuring the 10 keyword-shaped smoke queries plus a set of sentence-shaped
 * ones (search.test.ts) at several multiplier combinations:
 *  - 1x everywhere (no weighting) reproduces the reported defect.
 *  - 4/3/2 is the smallest weighting that measurably separates title/prose
 *    matches from code-only ones without changing which page wins any of the
 *    18 measured queries' *correct* top hit; it keeps every one of the 10
 *    original smoke cases at the same rank-1 page as before.
 *  - Pushing weights much higher (e.g. 15/10/5, 40/25/12) or shifting the
 *    ratio toward prose (e.g. 3/2/8) does not fix the worst offender in this
 *    codebase (see search.test.ts's "چطور یک برنامه Next.js..." case) and
 *    instead starts pulling in unrelated pages whose prose happens to repeat
 *    a rare query term (e.g. an AI-SDK telemetry page that mentions
 *    "Next.js" in an example), and it re-orders unrelated queries (e.g. a
 *    dbaas hardware-plans page briefly outscoring the disks pages). That
 *    query's failure mode is a separate, deeper issue than field weighting
 *    can fix: the corpus almost always spells the framework as one word,
 *    "NextJS" (one token), while a query typed as "Next.js" (with a dot)
 *    tokenizes to "next.js" + "next" + "js" — tokens that only coincide with
 *    two unrelated AI-SDK pages and the email-server code samples that
 *    happen to contain the literal string "Next.js" in a comment. Field
 *    weighting narrows the gap (see the before/after scores in the report)
 *    but does not flip the ranking; that is reported as a genuine remaining
 *    miss rather than tuned away.
 */
const TITLE_WEIGHT = 4;
const SECTION_WEIGHT = 3;
const TEXT_WEIGHT = 2;

function documentText(c: Chunk): string {
  return [
    Array(TITLE_WEIGHT).fill(c.pageTitle).join(" "),
    c.sectionTitle ? Array(SECTION_WEIGHT).fill(c.sectionTitle).join(" ") : "",
    c.platform ?? "",
    Array(TEXT_WEIGHT).fill(c.text).join(" "),
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

  // Fold duplicate query terms into a count map and multiply their score
  // contribution instead of re-scanning the corpus once per occurrence.
  // BM25's query-side sum is linear in the number of occurrences of a term
  // (the per-term contribution depends only on the *document*'s tf), so
  // `count * contribution` is exactly the value the repeated loop produced —
  // the ranking is unchanged, including the deliberate repetition in the
  // config enrichment vocabulary, which now reads as an explicit weight.
  // What changes is the cost: a 100k-token query with one distinct term is
  // one corpus scan, not 100,000 of them, so an oversized body can no longer
  // pin the single Node process for seconds.
  const counts = new Map<string, number>();
  for (const t of terms) counts.set(t, (counts.get(t) ?? 0) + 1);

  const N = index.chunks.length;
  const scores = new Float64Array(N);

  for (const [term, count] of counts) {
    const df = index.df.get(term);
    if (!df) continue;
    // Standard BM25 IDF with the +1 inside the log, which keeps the value
    // positive for terms appearing in more than half the corpus.
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));

    for (let i = 0; i < N; i++) {
      const f = index.tf[i].get(term);
      if (!f) continue;
      const norm = 1 - B + (B * index.lengths[i]) / (index.avgLength || 1);
      scores[i] += count * idf * ((f * (K1 + 1)) / (f + K1 * norm));
    }
  }

  const hits: SearchHit[] = [];
  for (let i = 0; i < N; i++) {
    if (scores[i] > 0) hits.push({ chunk: index.chunks[i], score: scores[i] });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
