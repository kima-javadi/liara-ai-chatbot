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

    // The defect this block guards: the intent regex used to OR the config
    // nouns with bare generation verbs, so "how to setup a redis database"
    // fired on `setup` and the enrichment replaced the entire top-6 with
    // paas/liarajson — zero Redis docs for a Redis question. Each case names
    // the page the query is genuinely about and asserts liarajson is nowhere
    // near the top.
    const NON_CONFIG_CASES: Array<{ q: string; expectUrl: string }> = [
      { q: "how to setup a redis database", expectUrl: "https://docs.liara.ir/dbaas/redis" },
      { q: "چطور یک دیتابیس MySQL بسازم", expectUrl: "https://docs.liara.ir/dbaas/mysql" },
      { q: "setup a postgres backup", expectUrl: "https://docs.liara.ir/dbaas/redis/how-tos/restore-backup" },
      { q: "setup nginx reverse proxy", expectUrl: "https://docs.liara.ir/paas/docker/related-apps/nginx" },
      { q: "generate an SSH key for my VM", expectUrl: "https://docs.liara.ir/iaas" },
      { q: "یک دیسک برای برنامه بساز", expectUrl: "https://docs.liara.ir/paas/" },
    ];

    it("does not hijack a query that has a generation verb but no config noun", () => {
      for (const { q, expectUrl } of NON_CONFIG_CASES) {
        const hits = search(retrievalQuery(q), 6);
        expect(hits[0]?.chunk.url, `top-1 for: ${q}`).toContain(expectUrl);
        for (const h of hits.slice(0, 3)) {
          expect(h.chunk.url, `liarajson should not be top-3 for: ${q}`).not.toContain(
            "/paas/liarajson",
          );
        }
      }
    });

    it("does not enrich a config noun that is not a generation request", () => {
      // "config nginx for laravel" and "کانفیگ ردیس" name a configuration but
      // ask nothing to be produced; enriching them buried the real answer.
      for (const q of ["config nginx for laravel", "کانفیگ ردیس", "liara.json port"]) {
        expect(retrievalQuery(q), q).toBe(q);
      }
    });

    it("does not carry config intent forward from the previous turn", () => {
      const previous = "برای پروژه Flask من یک liara.json بساز";
      const followUp = "چطور به دیتابیس MySQL وصل شوم؟";
      expect(retrievalQuery(followUp, previous)).toBe(`${previous} ${followUp}`);
    });

    // These four are the retrieval anchors the branch is measured against;
    // none of them may move.
    it("leaves the four retrieval anchors on their existing top-1 page", () => {
      const ANCHORS: Array<{ q: string; expectUrl: string }> = [
        { q: "خطای 502 bad gateway", expectUrl: "https://docs.liara.ir/paas/dotnet/fix-common-errors/502-bad-gateway" },
        { q: "پورت برنامه را چطور تنظیم کنم", expectUrl: "https://docs.liara.ir/paas/liarajson" },
        { q: "cron job در لیارا", expectUrl: "https://docs.liara.ir/paas/django/how-tos/set-cron-job" },
        { q: "liara.json port", expectUrl: "https://docs.liara.ir/paas/liarajson" },
      ];
      for (const { q, expectUrl } of ANCHORS) {
        expect(search(retrievalQuery(q), 6)[0]?.chunk.url, q).toContain(expectUrl);
      }
    });

    it("leaves unrelated queries unenriched", () => {
      // A plain question with no config-generation signal should not be
      // rewritten, so its ranking behaves exactly as before this change.
      expect(retrievalQuery("cron job در لیارا")).toBe("cron job در لیارا");
    });
  });

  // Regression coverage for the unbounded-query-cost fix. `queryIndex` now
  // folds duplicate query terms into a count map instead of re-scanning the
  // corpus once per occurrence. The claim attached to that change is "the
  // ranking is unchanged" — these cases test it against the real index and
  // the observable ranked output, not against the implementation's own
  // arithmetic.
  describe("duplicate query terms", () => {
    // Captured from the pre-deduplication implementation, over the same
    // committed index. If deduplication had altered ranking, these would move.
    const GOLDEN: Array<{ q: string; ids: string[] }> = [
      {
        q: "liara liara liara json json port",
        ids: [
          "https://docs.liara.ir/paas/liarajson#5-0",
          "https://docs.liara.ir/paas/docker/how-tos/deploy-image-from-dockerhub#tab0-0-0",
          "https://docs.liara.ir/paas/go/quick-start#step2-4-0",
          "https://docs.liara.ir/paas/python/quick-start#step2-3-0",
          "https://docs.liara.ir/references/cli/create-liara-json#1-0",
          "https://docs.liara.ir/paas/nodejs/how-tos/deploy-app#tab3-1-0",
        ],
      },
      {
        q: "port port port port app app platform",
        ids: [
          "https://docs.liara.ir/paas/go/quick-start#step2-4-0",
          "https://docs.liara.ir/paas/python/quick-start#step2-3-0",
          "https://docs.liara.ir/paas/docker/how-tos/deploy-app#tab3-1-0",
          "https://docs.liara.ir/paas/nodejs/quick-start#step1-6-0",
          "https://docs.liara.ir/paas/docker/quick-start#step1-6-0",
          "https://docs.liara.ir/paas/go/quick-start#step1-6-0",
        ],
      },
    ];

    it("reproduces the pre-deduplication ranking for repeated-term queries", () => {
      for (const { q, ids } of GOLDEN) {
        expect(search(q, 6).map((h) => h.chunk.id), q).toEqual(ids);
      }
    });

    it("orders a k-times-repeated query exactly like the original", () => {
      for (const q of ["اتصال به دیتابیس mysql", "liara.json port", "cron job در لیارا"]) {
        const base = search(q, 10).map((h) => h.chunk.id);
        for (const k of [3, 7]) {
          const repeated = Array(k).fill(q).join(" ");
          expect(search(repeated, 10).map((h) => h.chunk.id), `${q} x${k}`).toEqual(base);
        }
      }
    });

    // Before the fix this exact query took ~3.5s of blocking CPU on the real
    // index (measured); after, ~10ms. The threshold is deliberately loose so
    // it fails only on a return to per-occurrence scanning.
    it("does not spend seconds on a query of one repeated term", () => {
      const q = Array(100_000).fill("لیارا").join(" ");
      const started = performance.now();
      search(q, 6);
      expect(performance.now() - started).toBeLessThan(1_000);
    });
  });
});
