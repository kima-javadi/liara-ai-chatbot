import { describe, it, expect } from "vitest";
import { search } from "./index";
import { retrievalQuery } from "@/lib/ai/prompt";

/**
 * Each case asserts that a known page appears in the top results for a
 * question a user would plausibly type. Persian and English are both covered
 * because the corpus is Persian but developers often type English keywords.
 *
 * The first block is keyword-shaped (how a developer types into a search
 * box). The second block is sentence-shaped, natural Persian questions with
 * real sentence particles and punctuation — this is the shape that exposed
 * the field-weighting/tokenizer defect the keyword-shaped queries could not
 * catch, so both shapes are kept side by side rather than replacing one with
 * the other.
 */
const CASES: Array<{ q: string; expectUrl: string }> = [
  { q: "فایل liara.json چیست؟", expectUrl: "https://docs.liara.ir/paas/liarajson" },
  { q: "liara.json fields", expectUrl: "https://docs.liara.ir/paas/liarajson" },
  { q: "چطور Liara CLI را نصب کنم؟", expectUrl: "https://docs.liara.ir/references/cli" },
  { q: "liara deploy command", expectUrl: "https://docs.liara.ir/references/cli" },
  { q: "استقرار برنامه nextjs", expectUrl: "https://docs.liara.ir/paas/nextjs" },
  { q: "deploy laravel application", expectUrl: "https://docs.liara.ir/paas/laravel" },
  { q: "اتصال به دیتابیس mysql", expectUrl: "https://docs.liara.ir/dbaas/mysql" },
  { q: "object storage bucket", expectUrl: "https://docs.liara.ir/object-storage" },
  { q: "دامنه اختصاصی اضافه کنم", expectUrl: "https://docs.liara.ir/paas/domains" },
  { q: "django deployment", expectUrl: "https://docs.liara.ir/paas/django" },

  // Sentence-shaped, natural Persian questions.
  { q: "چطور یک برنامه Next.js را روی لیارا مستقر کنم؟", expectUrl: "https://docs.liara.ir/paas/nextjs" },
  { q: "چگونه دامنه اختصاصی به برنامه‌ام اضافه کنم؟", expectUrl: "https://docs.liara.ir/paas/domains" },
  { q: "چطور از دیتابیس مای‌اسکیوال بکاپ بگیرم؟", expectUrl: "https://docs.liara.ir/dbaas" },
  { q: "خطای ۵۰۲ می‌گیرم، چه کار کنم؟", expectUrl: "https://docs.liara.ir/paas" },
  { q: "چطور حجم دیسک برنامه را زیاد کنم؟", expectUrl: "https://docs.liara.ir/paas/disks" },
];

describe("search", () => {
  it("returns nothing for an empty query", () => {
    expect(search("")).toEqual([]);
  });

  it("respects the limit", () => {
    expect(search("liara").length).toBeLessThanOrEqual(6);
  });

  it("never returns a hit without a docs.liara.ir url", () => {
    for (const hit of search("liara.json port")) {
      expect(hit.chunk.url.startsWith("https://docs.liara.ir/")).toBe(true);
    }
  });

  // Reported as a pass rate rather than per-case assertions: BM25 will miss
  // some paraphrases, and a single stubborn case should not block the build.
  // A rate below the threshold means retrieval is genuinely broken.
  it("finds the expected page for most smoke queries", () => {
    const misses: string[] = [];
    for (const { q, expectUrl } of CASES) {
      const hits = search(q, 6);
      if (!hits.some((h) => h.chunk.url.startsWith(expectUrl))) misses.push(q);
    }
    const rate = (CASES.length - misses.length) / CASES.length;
    if (rate < 0.7) console.error("missed:", misses);
    expect(rate).toBeGreaterThanOrEqual(0.7);
  });

  // Regression coverage for the config-generation defect: a request to
  // *generate* a liara.json was retrieving incidental framework-name
  // mentions (an AI-SDK telemetry page, an unrelated SQLite how-to) instead
  // of the liara.json reference page that documents the real field list
  // (platform, port, app, disks, cron, build, healthCheck, ...). Queries go
  // through retrievalQuery — the same function the chat route calls — so
  // this exercises the actual enrichment path, not just bare search().
  describe("config-generation intent", () => {
    const CONFIG_CASES = [
      "برای پروژه Next.js من یک liara.json بساز",
      "یک فایل پیکربندی برای Laravel بساز",
      "generate a liara.json for my django app",
    ];

    it("includes a liarajson chunk in the retrieved set for every phrasing", () => {
      for (const q of CONFIG_CASES) {
        const hits = search(retrievalQuery(q), 6);
        expect(
          hits.some((h) => h.chunk.url.startsWith("https://docs.liara.ir/paas/liarajson")),
          `expected a liarajson chunk for: ${q}`,
        ).toBe(true);
      }
    });

    it("ranks a liarajson chunk first for every phrasing", () => {
      for (const q of CONFIG_CASES) {
        const hits = search(retrievalQuery(q), 6);
        expect(
          hits[0]?.chunk.url,
          `expected liarajson top-1 for: ${q}`,
        ).toMatch(/^https:\/\/docs\.liara\.ir\/paas\/liarajson/);
      }
    });

    it("leaves unrelated queries unenriched", () => {
      // A plain question with no config-generation signal should not be
      // rewritten, so its ranking behaves exactly as before this change.
      expect(retrievalQuery("cron job در لیارا")).toBe("cron job در لیارا");
    });
  });
});
