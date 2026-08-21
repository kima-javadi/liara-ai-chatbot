import fs from "node:fs";
import path from "node:path";
import { buildIndex, queryIndex, type Bm25Index } from "./bm25";
import type { Chunk, SearchHit } from "./types";

/**
 * The index is built once per process and reused. Building over ~4,000 chunks
 * takes well under a second, and it happens on a single cold request rather
 * than on every request.
 *
 * The artifact is read with `fs` rather than imported, so a 5 MB JSON file
 * does not go through the bundler.
 */
let cached: Bm25Index | null = null;

function load(): Bm25Index {
  if (cached) return cached;
  const file = path.join(process.cwd(), "data/docs-index.json");
  const chunks = JSON.parse(fs.readFileSync(file, "utf8")) as Chunk[];
  cached = buildIndex(chunks);
  return cached;
}

export function search(query: string, limit = 6): SearchHit[] {
  if (!query.trim()) return [];
  return queryIndex(load(), query, limit);
}

export type { Chunk, SearchHit };
