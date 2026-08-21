import { describe, it, expect } from "vitest";
import { buildIndex, queryIndex } from "./bm25";
import type { Chunk } from "./types";

function chunk(id: string, text: string, extra: Partial<Chunk> = {}): Chunk {
  return {
    id,
    url: `https://docs.liara.ir/${id}`,
    pageTitle: id,
    sectionTitle: null,
    platform: null,
    text,
    code: [],
    ...extra,
  };
}

const CORPUS: Chunk[] = [
  chunk("nextjs", "استقرار برنامه Next.js روی لیارا با liara deploy"),
  chunk("laravel", "استقرار برنامه Laravel روی لیارا و تنظیم php"),
  chunk("mysql", "اتصال به دیتابیس mysql و تنظیم رمز عبور"),
  chunk("liarajson", "فایل liara.json شامل platform و port و disks است"),
];

describe("bm25", () => {
  it("ranks the matching document first", () => {
    const index = buildIndex(CORPUS);
    const hits = queryIndex(index, "Next.js دیپلوی", 3);
    expect(hits[0].chunk.id).toBe("nextjs");
  });

  it("matches a technical token against its parts", () => {
    const index = buildIndex(CORPUS);
    const hits = queryIndex(index, "liara.json", 3);
    expect(hits[0].chunk.id).toBe("liarajson");
  });

  it("returns at most the requested number of hits", () => {
    const index = buildIndex(CORPUS);
    expect(queryIndex(index, "لیارا", 2)).toHaveLength(2);
  });

  it("returns an empty array when nothing matches", () => {
    const index = buildIndex(CORPUS);
    expect(queryIndex(index, "kubernetes helm chart", 5)).toEqual([]);
  });

  it("returns an empty array for an empty query", () => {
    const index = buildIndex(CORPUS);
    expect(queryIndex(index, "", 5)).toEqual([]);
  });

  it("scores every returned hit above zero", () => {
    const index = buildIndex(CORPUS);
    for (const hit of queryIndex(index, "mysql دیتابیس", 5)) {
      expect(hit.score).toBeGreaterThan(0);
    }
  });

  it("weights the page title into the document text", () => {
    const corpus = [
      chunk("a", "متن نامرتبط", { pageTitle: "راهنمای وردپرس" }),
      chunk("b", "متن نامرتبط دیگر"),
    ];
    const hits = queryIndex(buildIndex(corpus), "وردپرس", 2);
    expect(hits[0].chunk.id).toBe("a");
  });
});
