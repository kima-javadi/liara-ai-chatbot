# Liara Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a grounded RAG chat assistant that answers Liara Cloud deployment questions from Liara's official documentation, generates `liara.json` and CLI commands, diagnoses pasted error logs, and cites real doc URLs.

**Architecture:** A build-time script parses Liara's MDX docs into a committed JSON chunk index. Every chat request is rate-limited by IP, scrubbed of secrets, matched against the index with BM25, and answered by an OpenAI-compatible model with the retrieved chunks injected into the prompt. Citations are emitted as first-class `source-url` stream parts built from chunk metadata, never from model output.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · AI SDK v7 (`ai`, `@ai-sdk/openai`, `@ai-sdk/react`) · Vitest

**Spec:** `docs/superpowers/specs/2026-08-21-liara-copilot-design.md`

## Global Constraints

- **AI SDK is v7**, not v5 or v6. Three renames matter and are easy to get wrong from memory:
  - `system:` is now **`instructions:`** on `streamText` / `generateText`.
  - `result.toUIMessageStreamResponse()` is **deprecated**. Use the stateless `toUIMessageStream({ stream: result.stream })` plus `createUIMessageStreamResponse({ stream })`, both imported from `ai`.
  - `convertToModelMessages()` is **async** — it must be awaited.
- **The model must be created with `provider.chat(modelId)`.** Calling the provider directly (`provider(modelId)`) or via `provider.languageModel()` targets OpenAI's **Responses API**, which third-party OpenAI-compatible endpoints such as Liara's do not implement. Using the wrong one fails at runtime, not at compile time.
- **Model config is environment-only:** `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`. No provider-specific branching anywhere in `src/`.
- **The model never authors a URL.** Citations are derived from chunk metadata server-side. The system prompt forbids inventing links.
- **No persistence.** No database, no server-side chat storage, no logging of user message content.
- **Doc URL base is `https://docs.liara.ir/`**, derived from the file path under `src/pages/`.
- **BM25 constants:** `k1 = 1.2`, `b = 0.75`. Top **6** chunks injected.
- **`DOCS_PATH`** is required only by `npm run ingest`, never at runtime.
- **Persian is the primary UI language.** RTL base layout, LTR-isolated code and identifiers.
- Run `npx tsc --noEmit` and `npx eslint src --max-warnings=0` before every commit. The ESLint config includes React Compiler's `react-hooks/purity` rule, which rejects `Date.now()` and `Math.random()` inside component bodies and event handlers — use a `useRef` counter for ids.

## Current State

Already committed and working — do not rebuild:

- Next.js 16 + Tailwind v4 scaffold, `output: "standalone"`, `turbopack.root` set.
- Design system tokens in `src/app/globals.css` (`@theme` block), Vazirmatn + JetBrains Mono via `next/font/google`, RTL base in `src/app/layout.tsx`.
- `src/components/chat/` — `Header`, `MessageBubble`, `CodeBlock`, `SourceBadges`, `Chip`, `Composer`.
- `src/lib/highlight.tsx` — JSON/shell syntax highlighter.
- `src/lib/bidi.tsx` — isolates Latin runs in Persian text.
- `src/lib/mock.ts` — canned conversation. **Deleted in Task 8.**
- `src/app/page.tsx` — simulated streaming. **Rewritten in Task 8.**

`ai`, `@ai-sdk/openai`, and `@ai-sdk/react` are already installed.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `vitest.config.ts` | test runner config | 1 |
| `src/lib/security/scrub.ts` | secret redaction | 1 |
| `src/lib/security/scrub.test.ts` | scrubber tests | 1 |
| `src/lib/retrieval/tokenize.ts` | Persian + technical tokenization | 2 |
| `src/lib/retrieval/tokenize.test.ts` | tokenizer tests | 2 |
| `src/lib/retrieval/stopwords.ts` | Persian stopword list | 2 |
| `src/lib/retrieval/types.ts` | `Chunk`, `SearchHit` | 3 |
| `src/lib/retrieval/bm25.ts` | scoring | 3 |
| `src/lib/retrieval/bm25.test.ts` | scoring tests | 3 |
| `scripts/ingest.mjs` | MDX → `data/docs-index.json` | 4 |
| `scripts/ingest.test.mjs` | corpus assertions | 4 |
| `data/docs-index.json` | committed index artifact | 4 |
| `src/lib/retrieval/index.ts` | load artifact, expose `search()` | 5 |
| `src/lib/retrieval/search.test.ts` | retrieval smoke set | 5 |
| `src/lib/security/rate-limit.ts` | per-IP sliding window | 6 |
| `src/lib/security/rate-limit.test.ts` | limiter tests | 6 |
| `src/lib/ai/provider.ts` | env-configured model | 7 |
| `src/lib/ai/prompt.ts` | system prompt + context builder | 7 |
| `src/app/api/chat/route.ts` | orchestration and streaming | 7 |
| `src/lib/chips.ts` | parse follow-up marker | 8 |
| `src/lib/chips.test.ts` | marker parsing tests | 8 |
| `src/app/page.tsx` | wired to `/api/chat` | 8 |
| `Dockerfile`, `liara.json`, `.env.example`, `README.md` | deployment | 9 |

---

### Task 1: Test harness and secret scrubber

The scrubber is a pure function and the highest-stakes piece of security code in the app, so it goes first and brings the test runner with it.

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/security/scrub.ts`
- Test: `src/lib/security/scrub.test.ts`
- Modify: `package.json` (add `test` script)

**Interfaces:**
- Consumes: nothing
- Produces: `scrub(text: string): string`

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Create the Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Write the failing test**

Create `src/lib/security/scrub.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { scrub } from "./scrub";

describe("scrub", () => {
  it("redacts OpenAI-style API keys", () => {
    expect(scrub("my key is sk-abc123DEF456ghi789JKL012mno345")).toBe(
      "my key is [REDACTED]",
    );
  });

  it("redacts bearer tokens but keeps the header name", () => {
    expect(scrub("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def")).toBe(
      "Authorization: Bearer [REDACTED]",
    );
  });

  it("redacts the password inside a database connection string", () => {
    expect(scrub("mysql://root:hunter2@db.liara.cloud:3306/mydb")).toBe(
      "mysql://root:[REDACTED]@db.liara.cloud:3306/mydb",
    );
  });

  it("redacts PEM private key blocks", () => {
    const pem =
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\nabc123\n-----END RSA PRIVATE KEY-----";
    expect(scrub(pem)).toBe("[REDACTED]");
  });

  it("redacts values of secret-looking env assignments", () => {
    expect(scrub("API_KEY=supersecretvalue123")).toBe("API_KEY=[REDACTED]");
    expect(scrub("DB_PASSWORD=hunter2")).toBe("DB_PASSWORD=[REDACTED]");
  });

  it("leaves ordinary prose untouched", () => {
    const text = "چطور یک پروژه Next.js را روی لیارا دیپلوی کنم؟";
    expect(scrub(text)).toBe(text);
  });

  it("leaves ordinary code and non-secret env vars untouched", () => {
    const code = 'liara deploy --app my-app --port 3000\nPORT=3000\nNODE_ENV=production';
    expect(scrub(code)).toBe(code);
  });

  it("leaves an error log untouched", () => {
    const log = "npm ERR! cipm can only install packages when your package.json";
    expect(scrub(log)).toBe(log);
  });
});
```

- [ ] **Step 4: Run the test and verify it fails**

Run: `npx vitest run src/lib/security/scrub.test.ts`
Expected: FAIL — cannot resolve `./scrub`.

- [ ] **Step 5: Implement the scrubber**

Create `src/lib/security/scrub.ts`:

```ts
/**
 * Redacts secrets from user text before it reaches the model provider.
 *
 * This runs server-side on the request path, not at render time. Nothing is
 * persisted anywhere, so keeping secrets out of the outbound provider request
 * is this function's entire job.
 *
 * Order matters: PEM blocks are matched before anything else, because their
 * base64 payload can otherwise trip the generic token patterns and leave a
 * partially-redacted key behind.
 */

const REDACTED = "[REDACTED]";

const PATTERNS: Array<[RegExp, string]> = [
  // PEM private key blocks, including the BEGIN/END lines.
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, REDACTED],

  // Provider API keys: sk-, rk-, ghp_, gho_, xoxb-, AKIA...
  [/\b(?:sk|rk)-[A-Za-z0-9_-]{16,}/g, REDACTED],
  [/\bgh[pousr]_[A-Za-z0-9]{16,}/g, REDACTED],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/g, REDACTED],
  [/\bAKIA[0-9A-Z]{16}\b/g, REDACTED],

  // Bearer tokens: keep the scheme so the shape of the log stays readable.
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, `Bearer ${REDACTED}`],

  // Password inside a connection string: scheme://user:PASSWORD@host
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@]+(@)/gi, `$1${REDACTED}$2`],

  // Secret-looking environment assignments. The key name is preserved; only
  // the value is replaced, so the user can still see which variable it was.
  [
    /\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)[A-Z0-9_]*)\s*=\s*("[^"]*"|'[^']*'|\S+)/g,
    `$1=${REDACTED}`,
  ],
];

export function scrub(text: string): string {
  let out = text;
  for (const [re, replacement] of PATTERNS) {
    out = out.replace(re, replacement);
  }
  return out;
}
```

- [ ] **Step 6: Run the tests and verify they pass**

Run: `npx vitest run src/lib/security/scrub.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 7: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npx eslint src --max-warnings=0
git add vitest.config.ts package.json package-lock.json src/lib/security/
git commit -m "feat: add secret scrubber with vitest harness"
```

---

### Task 2: Persian and technical tokenizer

**Files:**
- Create: `src/lib/retrieval/stopwords.ts`
- Create: `src/lib/retrieval/tokenize.ts`
- Test: `src/lib/retrieval/tokenize.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `normalize(text: string): string`
  - `tokenize(text: string): string[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/retrieval/tokenize.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalize, tokenize } from "./tokenize";

describe("normalize", () => {
  it("folds Arabic yeh and kaf to Persian forms", () => {
    expect(normalize("كيف")).toBe("کیف");
  });

  it("folds Arabic-Indic and Persian digits to ASCII", () => {
    expect(normalize("٣٠٠٠")).toBe("3000");
    expect(normalize("۳۰۰۰")).toBe("3000");
  });

  it("strips diacritics", () => {
    expect(normalize("مُستَندات")).toBe("مستندات");
  });

  it("turns the zero-width non-joiner into a space", () => {
    expect(normalize("می\u200cشود")).toBe("می شود");
  });

  it("lowercases Latin text", () => {
    expect(normalize("NextJS")).toBe("nextjs");
  });
});

describe("tokenize", () => {
  it("keeps technical tokens intact and also emits their parts", () => {
    const t = tokenize("liara.json");
    expect(t).toContain("liara.json");
    expect(t).toContain("liara");
    expect(t).toContain("json");
  });

  it("keeps flags intact without their leading dashes as a separate token", () => {
    const t = tokenize("--build-location");
    expect(t).toContain("build-location");
    expect(t).toContain("build");
    expect(t).toContain("location");
  });

  it("splits Persian prose on whitespace", () => {
    expect(tokenize("استقرار برنامه")).toEqual(["استقرار", "برنامه"]);
  });

  it("removes Persian stopwords", () => {
    expect(tokenize("این یک برنامه است")).toEqual(["برنامه"]);
  });

  it("keeps digits as tokens", () => {
    expect(tokenize("port 3000")).toEqual(["port", "3000"]);
  });

  it("returns an empty array for empty input", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("does not emit duplicate parts when the whole equals the part", () => {
    expect(tokenize("liara")).toEqual(["liara"]);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/lib/retrieval/tokenize.test.ts`
Expected: FAIL — cannot resolve `./tokenize`.

- [ ] **Step 3: Create the stopword list**

Create `src/lib/retrieval/stopwords.ts`:

```ts
/**
 * Persian stopwords, plus a small set of English words that appear constantly
 * in the docs without carrying retrieval signal.
 *
 * Deliberately excludes technical words that look like stopwords but are not:
 * "in", "on", and "up" are not listed because `liara logs -f`, `npm run`, and
 * similar phrasings depend on short English tokens.
 */
export const STOPWORDS = new Set([
  // Persian
  "و", "در", "به", "از", "که", "این", "را", "با", "است", "برای", "آن", "یک",
  "خود", "تا", "کرد", "بر", "هم", "نیز", "شده", "های", "شود", "می", "بود",
  "یا", "ها", "کند", "کنید", "کنیم", "شما", "ما", "او", "آنها", "اگر", "پس",
  "چون", "دیگر", "همه", "هر", "باید", "بعد", "قبل", "روی", "زیر", "بین",
  "وقتی", "چه", "کدام", "چرا", "چگونه", "کجا", "کی", "آیا", "بله", "خیر",
  "نه", "فقط", "حتی", "مانند", "مثل", "طور", "نوع", "مورد", "طریق", "توسط",
  "درباره", "بدون", "همچنین", "بنابراین", "اما", "ولی", "زیرا", "سپس",
  "اکنون", "الان", "همیشه", "هرگز", "شاید", "باشد", "بودن", "دارد", "دارند",
  "داشته", "کردن", "شدن", "گرفت", "داد", "آمد", "رفت", "دهد", "گیرد",
  "خواهد", "توان", "میتوان", "نمی", "بیشتر", "کمتر", "خیلی", "بسیار",
  "چند", "همان", "آنچه", "کل", "تمام", "سایر", "برخی", "یعنی",
  // English filler
  "the", "a", "an", "and", "or", "of", "to", "is", "are", "was", "were",
  "be", "been", "it", "this", "that", "these", "those", "you", "your",
  "we", "our", "can", "will", "would", "should", "if", "then", "than",
  "for", "with", "from", "as", "at", "by",
]);
```

- [ ] **Step 4: Implement the tokenizer**

Create `src/lib/retrieval/tokenize.ts`:

```ts
import { STOPWORDS } from "./stopwords";

/**
 * Normalization and tokenization for a mixed Persian/technical corpus.
 *
 * Persian text arrives with inconsistent orthography — Arabic yeh and kaf mixed
 * with Persian forms, three different digit sets, optional diacritics — and
 * BM25 treats each variant as a different term. Without normalization a query
 * typed with an Arabic keyboard cannot match a document typed with a Persian
 * one, which is a total retrieval failure rather than a quality issue.
 */

const ARABIC_YEH = /[\u064A\u0649]/g; // ي, ى -> ی
const ARABIC_KAF = /[\u0643]/g; // ك -> ک
const DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const ZWNJ = /[\u200C\u200F\u200E]/g;
const ARABIC_INDIC = /[\u0660-\u0669]/g;
const PERSIAN_DIGITS = /[\u06F0-\u06F9]/g;

export function normalize(text: string): string {
  return text
    .replace(ARABIC_YEH, "\u06CC")
    .replace(ARABIC_KAF, "\u06A9")
    .replace(DIACRITICS, "")
    .replace(ZWNJ, " ")
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(PERSIAN_DIGITS, (d) => String(d.charCodeAt(0) - 0x06f0))
    .toLowerCase();
}

/**
 * A technical token: Latin/digits joined by internal `.`, `-`, `_`, `/`, `:`.
 * Leading dashes are excluded from the capture so `--build-location` yields
 * `build-location` rather than a token no query would ever reproduce.
 */
const TECHNICAL = /[a-z0-9]+(?:[._\-/:][a-z0-9]+)+/g;
const WORD = /[a-z0-9]+|[\u0600-\u06FF]+/g;

export function tokenize(text: string): string[] {
  const normalized = normalize(text);
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (t: string) => {
    if (!t || STOPWORDS.has(t)) return;
    const key = `${t}@${out.length}`;
    // Term frequency matters to BM25, so duplicates across the document are
    // kept. Only the whole/part pair emitted from one match is de-duplicated.
    if (seen.has(key)) return;
    out.push(t);
  };

  // Technical tokens first: capture the whole, then its parts, then blank the
  // match so the generic word pass does not re-emit the parts a second time.
  let remainder = normalized;
  const technical = normalized.match(TECHNICAL) ?? [];
  for (const whole of technical) {
    push(whole);
    const parts = whole.split(/[._\-/:]/).filter(Boolean);
    if (parts.length > 1) for (const p of parts) push(p);
    remainder = remainder.replace(whole, " ");
  }

  for (const w of remainder.match(WORD) ?? []) push(w);

  return out;
}
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npx vitest run src/lib/retrieval/tokenize.test.ts`
Expected: PASS, 13 tests.

If `tokenize("liara")` returns a duplicate, the `parts.length > 1` guard is missing — a single-part technical token must not re-emit itself.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npx eslint src --max-warnings=0
git add src/lib/retrieval/
git commit -m "feat: add Persian and technical tokenizer"
```

---

### Task 3: BM25 scoring

**Files:**
- Create: `src/lib/retrieval/types.ts`
- Create: `src/lib/retrieval/bm25.ts`
- Test: `src/lib/retrieval/bm25.test.ts`

**Interfaces:**
- Consumes: `tokenize` from Task 2
- Produces:
  - `type Chunk = { id, url, pageTitle, sectionTitle, platform, text, code }`
  - `type SearchHit = { chunk: Chunk; score: number }`
  - `buildIndex(chunks: Chunk[]): Bm25Index`
  - `queryIndex(index: Bm25Index, query: string, limit: number): SearchHit[]`

- [ ] **Step 1: Define the shared types**

Create `src/lib/retrieval/types.ts`:

```ts
export type CodeBlock = {
  lang: string;
  body: string;
};

export type Chunk = {
  /** Stable identifier: url plus section and part index. */
  id: string;
  /** Public docs.liara.ir URL derived from the source file path. */
  url: string;
  pageTitle: string;
  sectionTitle: string | null;
  /** Tab label when the chunk came from a per-platform `<Tabs>` branch. */
  platform: string | null;
  text: string;
  code: CodeBlock[];
};

export type SearchHit = {
  chunk: Chunk;
  score: number;
};
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/retrieval/bm25.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `npx vitest run src/lib/retrieval/bm25.test.ts`
Expected: FAIL — cannot resolve `./bm25`.

- [ ] **Step 4: Implement BM25**

Create `src/lib/retrieval/bm25.ts`:

```ts
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
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npx vitest run src/lib/retrieval/bm25.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npx eslint src --max-warnings=0
git add src/lib/retrieval/
git commit -m "feat: add BM25 scoring over doc chunks"
```

---

### Task 4: Ingestion script

Produces the committed index. The regex ordering here is load-bearing and was verified against the real corpus during the design spike.

**Files:**
- Create: `scripts/ingest.mjs`
- Create: `scripts/ingest.test.mjs`
- Create: `data/docs-index.json` (generated, then committed)
- Modify: `package.json` (add `ingest` script)

**Interfaces:**
- Consumes: `DOCS_PATH` environment variable
- Produces: `data/docs-index.json`, an array of `Chunk` as defined in Task 3

- [ ] **Step 1: Write the ingestion script**

Create `scripts/ingest.mjs`:

```js
#!/usr/bin/env node
/**
 * Converts Liara's MDX documentation into a flat chunk index.
 *
 * The docs are not Markdown. They are MDX with heavy JSX: headings are
 * `<Section title="..." />`, code lives inside `<Highlight>{`...`}</Highlight>`,
 * and per-platform variants live inside `<Tabs tabs={[...]} content={[...]}>`.
 *
 * Parsing is targeted regex rather than an MDX/estree parse. The component
 * vocabulary is small and consistent, and the JSX-inside-array-prop shape of
 * `<Tabs>` is disproportionately painful to parse properly. A regex miss
 * degrades a chunk's text quality; it does not crash the build.
 *
 * ORDER IS LOAD-BEARING. Code blocks are masked before component stripping.
 * The corpus contains C# `<IActionResult>` and Apache `<IfModule>` inside code
 * blocks, which the component-stripping pass would otherwise mangle.
 */
import fs from "node:fs";
import path from "node:path";

const DOCS_PATH = process.env.DOCS_PATH;
if (!DOCS_PATH) {
  console.error("DOCS_PATH is required. Example:");
  console.error("  DOCS_PATH=/path/to/liara-docs npm run ingest");
  process.exit(1);
}

const PAGES = path.join(DOCS_PATH, "src/pages");
if (!fs.existsSync(PAGES)) {
  console.error(`Not found: ${PAGES}`);
  console.error("DOCS_PATH should be the root of the Liara docs repository.");
  process.exit(1);
}

const OUT = path.join(process.cwd(), "data/docs-index.json");
const MAX_CHARS = 1500;
const MIN_PROSE = 80;

const HIGHLIGHT =
  /<Highlight[^>]*className="([a-zA-Z0-9]+)"[^>]*>\s*\{`([\s\S]*?)`\}\s*<\/Highlight>/g;
const TABS = /<(Tabs|HighlightTabs)\s+tabs=\{\[([\s\S]*?)\]\}\s*content=\{\[([\s\S]*?)\]\}\s*\/?>/g;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".mdx")) out.push(p);
  }
  return out;
}

function urlFor(file) {
  const rel = path.relative(PAGES, file).replace(/\.mdx$/, "").replace(/\/index$/, "");
  return `https://docs.liara.ir/${rel}`;
}

/**
 * Strips the site's title boilerplate. Every page title is of the form
 * "مستندات <subject> - لیارا"; leaving it in place would give those terms a
 * document frequency equal to the corpus size and destroy their IDF.
 */
function cleanTitle(raw) {
  return raw
    .replace(/^\s*مستندات\s+/, "")
    .replace(/\s*-\s*لیارا\s*$/, "")
    .trim();
}

function stripJsx(src) {
  return src
    .replace(/<\/?[A-Za-z][^>]*>/g, " ")
    .replace(/\{`[\s\S]*?`\}/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Splits a `content={[ <>..</>, <>..</> ]}` array into per-tab fragments. */
function splitTabContent(raw) {
  return raw
    .split(/<\/>\s*,/)
    .map((s) => s.replace(/^\s*,?\s*<>/, "").replace(/<\/>\s*$/, ""))
    .filter((s) => s.trim());
}

const chunks = [];
const files = walk(PAGES);

for (const file of files) {
  let src = fs.readFileSync(file, "utf8");
  const url = urlFor(file);

  const titleMatch = src.match(/<title>([^<]*)<\/title>/);
  const h1Match = src.match(/^#\s+(.+)$/m);
  const pageTitle = cleanTitle(
    titleMatch?.[1] || h1Match?.[1] || path.basename(file, ".mdx"),
  );

  // 1. Mask code blocks FIRST.
  const codes = [];
  src = src.replace(HIGHLIGHT, (_m, lang, body) => {
    codes.push({ lang, body: body.trim() });
    return ` \u0000CODE${codes.length - 1}\u0000 `;
  });

  // 2. Drop imports and the page wrapper.
  src = src
    .replace(/^import[^\n]*\n/gm, "")
    .replace(/<Head>[\s\S]*?<\/Head>/g, "")
    .replace(/<\/?Layout>/g, "");

  const emit = (rawText, sectionTitle, platform, seq) => {
    const used = [...rawText.matchAll(/\u0000CODE(\d+)\u0000/g)].map(
      (m) => codes[Number(m[1])],
    ).filter(Boolean);
    const text = stripJsx(rawText.replace(/\u0000CODE\d+\u0000/g, " "));
    if (text.length < MIN_PROSE && used.length === 0) return;

    const parts = Math.max(1, Math.ceil(text.length / MAX_CHARS));
    for (let k = 0; k < parts; k++) {
      chunks.push({
        id: `${url}#${seq}-${k}`,
        url,
        pageTitle,
        sectionTitle,
        platform,
        // Repeat the titles into every part so context survives the split.
        text: [pageTitle, sectionTitle, platform, text.slice(k * MAX_CHARS, (k + 1) * MAX_CHARS)]
          .filter(Boolean)
          .join(" \u2014 "),
        code: k === 0 ? used : [],
      });
    }
  };

  // 3. Pull each `<Tabs>` group out into per-platform chunks, replacing the
  //    group in the page body so its content is not also emitted as prose.
  let seq = 0;
  const tabGroups = [...src.matchAll(TABS)];
  for (const g of tabGroups) {
    const labels = [...g[2].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    const bodies = splitTabContent(g[3]);
    for (let i = 0; i < labels.length; i++) {
      if (!bodies[i]) continue;
      emit(bodies[i], null, labels[i], `tab${seq}-${i}`);
    }
    src = src.replace(g[0], " ");
    seq++;
  }

  // 4. Split what remains on `<Section>` boundaries.
  const sectionTitles = [...src.matchAll(/<Section\s[^>]*title="([^"]*)"/g)].map(
    (m) => m[1],
  );
  const parts = src.split(/<Section\s[^>]*\/>/);
  parts.forEach((part, i) => {
    // Positional fallback: some `<Section>` tags carry no title attribute, so
    // the titles array can be shorter than the split array.
    emit(part, i === 0 ? null : (sectionTitles[i - 1] ?? null), null, i);
  });
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(chunks));

const bytes = fs.statSync(OUT).size;
console.log(`files:  ${files.length}`);
console.log(`chunks: ${chunks.length}`);
console.log(`output: ${OUT} (${(bytes / 1048576).toFixed(2)} MB)`);
```

Add to `package.json` scripts:

```json
"ingest": "node scripts/ingest.mjs"
```

- [ ] **Step 2: Run the ingestion against the real corpus**

```bash
DOCS_PATH=/Users/kimia/docs npm run ingest
```

Expected: roughly 1,143 files, 3,500–5,000 chunks, and an output between 4 and 8 MB. A chunk count under 2,000 means tab splitting silently failed; a size over 15 MB means the code-block masking is leaking raw MDX into the text.

- [ ] **Step 3: Write the corpus assertion test**

Create `scripts/ingest.test.mjs`:

```js
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";

const INDEX = path.join(process.cwd(), "data/docs-index.json");

describe("docs index", () => {
  let chunks;

  beforeAll(() => {
    if (!fs.existsSync(INDEX)) {
      throw new Error("data/docs-index.json missing. Run: DOCS_PATH=... npm run ingest");
    }
    chunks = JSON.parse(fs.readFileSync(INDEX, "utf8"));
  });

  it("contains a substantial number of chunks", () => {
    expect(chunks.length).toBeGreaterThan(2000);
  });

  it("gives every chunk a well-formed docs.liara.ir URL", () => {
    const bad = chunks.filter((c) => !/^https:\/\/docs\.liara\.ir\/[\w\-/]*$/.test(c.url));
    expect(bad.map((c) => c.url).slice(0, 5)).toEqual([]);
  });

  it("leaks no raw MDX into chunk text", () => {
    const bad = chunks.filter((c) =>
      /<Highlight|<Section|^import |<Layout|\u0000CODE/.test(c.text),
    );
    expect(bad.map((c) => c.id).slice(0, 5)).toEqual([]);
  });

  it("produces tab-derived chunks carrying a platform label", () => {
    const tabbed = chunks.filter((c) => c.platform);
    expect(tabbed.length).toBeGreaterThan(500);
  });

  it("strips title boilerplate", () => {
    const bad = chunks.filter((c) => / - لیارا$/.test(c.pageTitle));
    expect(bad.map((c) => c.pageTitle).slice(0, 5)).toEqual([]);
  });

  it("gives every chunk non-empty text", () => {
    expect(chunks.filter((c) => !c.text.trim()).length).toBe(0);
  });

  it("indexes the liara.json reference page", () => {
    expect(chunks.some((c) => c.url === "https://docs.liara.ir/paas/liarajson")).toBe(true);
  });
});
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run scripts/ingest.test.mjs`
Expected: PASS, 7 tests.

If "leaks no raw MDX" fails, the masking order in the script has been changed — code masking must happen before the `import`/`<Head>`/`<Layout>` pass.

- [ ] **Step 5: Commit the script and the index**

The index is committed deliberately, so the Docker build needs no docs checkout.

```bash
npx eslint src --max-warnings=0
git add scripts/ data/docs-index.json package.json
git commit -m "feat: add MDX ingestion producing committed doc index"
```

---

### Task 5: Retrieval loader and smoke set

**Files:**
- Create: `src/lib/retrieval/index.ts`
- Test: `src/lib/retrieval/search.test.ts`

**Interfaces:**
- Consumes: `buildIndex`, `queryIndex` (Task 3); `data/docs-index.json` (Task 4)
- Produces: `search(query: string, limit?: number): SearchHit[]`

- [ ] **Step 1: Write the failing smoke test**

This is the honest measure of whether retrieval works. Create `src/lib/retrieval/search.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { search } from "./index";

/**
 * Each case asserts that a known page appears in the top results for a
 * question a user would plausibly type. Persian and English are both covered
 * because the corpus is Persian but developers often type English keywords.
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
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/lib/retrieval/search.test.ts`
Expected: FAIL — cannot resolve `./index`.

- [ ] **Step 3: Implement the loader**

Create `src/lib/retrieval/index.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/lib/retrieval/search.test.ts`
Expected: PASS, 4 tests.

If the smoke case pass rate is below 0.7, first confirm the expected URLs actually exist in the corpus:

```bash
node -e "const c=require('./data/docs-index.json');const u=[...new Set(c.map(x=>x.url))];console.log(u.filter(x=>/cli|nextjs|mysql|domains/.test(x)).slice(0,20).join('\n'))"
```

Correct the `expectUrl` values to match real paths before touching the tokenizer — a wrong expectation in the test is far more likely than broken scoring.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npx eslint src --max-warnings=0
git add src/lib/retrieval/
git commit -m "feat: add retrieval loader with smoke test set"
```

---

### Task 6: Per-IP rate limiter

**Files:**
- Create: `src/lib/security/rate-limit.ts`
- Test: `src/lib/security/rate-limit.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `checkRateLimit(ip: string, now?: number): { allowed: boolean; retryAfter: number }`

- [ ] **Step 1: Write the failing test**

Create `src/lib/security/rate-limit.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, __resetRateLimit, LIMIT, WINDOW_MS } from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => __resetRateLimit());

  it("allows requests up to the limit", () => {
    for (let i = 0; i < LIMIT; i++) {
      expect(checkRateLimit("1.1.1.1", 1000).allowed).toBe(true);
    }
  });

  it("blocks the request after the limit", () => {
    for (let i = 0; i < LIMIT; i++) checkRateLimit("1.1.1.1", 1000);
    const result = checkRateLimit("1.1.1.1", 1000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("tracks each IP separately", () => {
    for (let i = 0; i < LIMIT; i++) checkRateLimit("1.1.1.1", 1000);
    expect(checkRateLimit("2.2.2.2", 1000).allowed).toBe(true);
  });

  it("allows again once the window has slid past", () => {
    for (let i = 0; i < LIMIT; i++) checkRateLimit("1.1.1.1", 1000);
    expect(checkRateLimit("1.1.1.1", 1000).allowed).toBe(false);
    expect(checkRateLimit("1.1.1.1", 1000 + WINDOW_MS + 1).allowed).toBe(true);
  });

  it("slides rather than resetting in fixed buckets", () => {
    // Fill the window with timestamps spread across it.
    for (let i = 0; i < LIMIT; i++) checkRateLimit("1.1.1.1", 1000 + i * 10);
    // Just past the first entry's expiry, exactly one slot frees up.
    const t = 1000 + WINDOW_MS + 1;
    expect(checkRateLimit("1.1.1.1", t).allowed).toBe(true);
    expect(checkRateLimit("1.1.1.1", t).allowed).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/lib/security/rate-limit.test.ts`
Expected: FAIL — cannot resolve `./rate-limit`.

- [ ] **Step 3: Implement the limiter**

Create `src/lib/security/rate-limit.ts`:

```ts
/**
 * In-memory sliding-window rate limiter, keyed by IP.
 *
 * Known and accepted limitation: state is per process, so the limit is per
 * instance and resets on deploy. That is adequate for a single-instance
 * hackathon deployment and is documented in the spec rather than hidden.
 *
 * `now` is injectable so the tests do not depend on wall-clock time, which
 * also keeps this module free of the impure calls the React Compiler lint
 * rejects elsewhere in the codebase.
 */

export const LIMIT = 20;
export const WINDOW_MS = 60_000;

const hits = new Map<string, number[]>();

export function checkRateLimit(
  ip: string,
  now: number = Date.now(),
): { allowed: boolean; retryAfter: number } {
  const cutoff = now - WINDOW_MS;
  const recent = (hits.get(ip) ?? []).filter((t) => t > cutoff);

  if (recent.length >= LIMIT) {
    hits.set(ip, recent);
    const retryAfter = Math.ceil((recent[0] + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfter: Math.max(1, retryAfter) };
  }

  recent.push(now);
  hits.set(ip, recent);

  // Opportunistic cleanup: without this the map grows once per unique IP for
  // the life of the process.
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (!times.some((t) => t > cutoff)) hits.delete(key);
    }
  }

  return { allowed: true, retryAfter: 0 };
}

/** Test-only. */
export function __resetRateLimit(): void {
  hits.clear();
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/lib/security/rate-limit.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npx eslint src --max-warnings=0
git add src/lib/security/
git commit -m "feat: add per-IP sliding window rate limiter"
```

---

### Task 7: Chat endpoint

**Files:**
- Create: `src/lib/ai/provider.ts`
- Create: `src/lib/ai/prompt.ts`
- Create: `src/app/api/chat/route.ts`
- Create: `.env.local` (not committed)

**Interfaces:**
- Consumes: `search` (Task 5), `scrub` (Task 1), `checkRateLimit` (Task 6)
- Produces: `POST /api/chat` returning a UI message stream with `source-url` parts

- [ ] **Step 1: Create the provider**

Create `src/lib/ai/provider.ts`:

```ts
import { createOpenAI } from "@ai-sdk/openai";

/**
 * An OpenAI-compatible provider configured entirely from the environment, so
 * pointing at Liara's AI endpoint, a proxy, or OpenAI itself is a config
 * change with no code change.
 *
 * `.chat()` is required, not stylistic. Calling the provider directly or via
 * `.languageModel()` targets OpenAI's Responses API, which third-party
 * OpenAI-compatible endpoints do not implement. That failure appears at
 * runtime as a 404 from the provider, not at compile time.
 */
const provider = createOpenAI({
  baseURL: process.env.AI_BASE_URL,
  apiKey: process.env.AI_API_KEY,
  name: "liara-ai",
});

export function chatModel() {
  const id = process.env.AI_MODEL;
  if (!id) throw new Error("AI_MODEL is not set");
  return provider.chat(id);
}
```

- [ ] **Step 2: Create the prompt builder**

Create `src/lib/ai/prompt.ts`:

```ts
import type { SearchHit } from "@/lib/retrieval";

export const CHIP_MARKER_OPEN = "<<<NEXT:";
export const CHIP_MARKER_CLOSE = ">>>";

export const SYSTEM_PROMPT = `تو «Liara Copilot» هستی، دستیار استقرار و مستندات پلتفرم ابری لیارا.

قواعد قطعی:
1. فقط بر اساس «مستندات» ارائه‌شده در پیام context پاسخ بده. اگر پاسخ در مستندات نیست، صریح بگو که در مستندات پوشش داده نشده و حدس نزن.
2. هرگز لینک نساز. لینک منابع به‌صورت خودکار توسط سیستم اضافه می‌شود؛ تو نباید هیچ URL ای بنویسی.
3. به همان زبانی پاسخ بده که کاربر نوشته است (فارسی یا انگلیسی).
4. برای فایل‌های پیکربندی و دستورات، از بلوک کد با زبان مشخص استفاده کن. برای liara.json از \`\`\`json:liara.json و برای دستورات از \`\`\`bash استفاده کن.
5. وقتی کاربر لاگ خطا می‌فرستد، اول علت ریشه‌ای را در یک جمله بگو، سپس دستورهای رفع مشکل را قدم‌به‌قدم بده.
6. کوتاه و عملی بنویس. از مقدمه‌چینی پرهیز کن.

در انتهای هر پاسخ، دقیقاً یک خط با این قالب اضافه کن که شامل ۲ تا ۳ پیشنهاد برای قدم بعدی است:
${CHIP_MARKER_OPEN} پیشنهاد اول | پیشنهاد دوم | پیشنهاد سوم ${CHIP_MARKER_CLOSE}
این خط باید آخرین خط پاسخ باشد و هیچ متنی بعد از آن نیاید.`;

/**
 * Renders retrieved chunks as the grounding context.
 *
 * URLs are deliberately omitted. The model has no use for them — citations are
 * emitted by the route from the same chunk metadata — and including them is an
 * invitation to paste a mangled one into the prose.
 */
export function buildContext(hits: SearchHit[]): string {
  if (!hits.length) {
    return "مستندات مرتبطی یافت نشد. به کاربر بگو که این موضوع در مستندات لیارا پیدا نشد.";
  }

  const blocks = hits.map((hit, i) => {
    const c = hit.chunk;
    const heading = [c.pageTitle, c.sectionTitle, c.platform]
      .filter(Boolean)
      .join(" / ");
    const code = c.code
      .map((b) => `\`\`\`${b.lang}\n${b.body}\n\`\`\``)
      .join("\n");
    return `[سند ${i + 1}] ${heading}\n${c.text}\n${code}`.trim();
  });

  return `مستندات مرتبط:\n\n${blocks.join("\n\n---\n\n")}`;
}

/**
 * The retrieval query. The previous user message is folded in because
 * retrieval runs on every turn without conversation awareness, and a follow-up
 * like "برای Laravel چطور؟" carries almost no searchable signal on its own.
 */
export function retrievalQuery(current: string, previous?: string): string {
  return previous ? `${previous} ${current}` : current;
}
```

- [ ] **Step 3: Write the route**

Create `src/app/api/chat/route.ts`:

```ts
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { chatModel } from "@/lib/ai/provider";
import { SYSTEM_PROMPT, buildContext, retrievalQuery } from "@/lib/ai/prompt";
import { search } from "@/lib/retrieval";
import { scrub } from "@/lib/security/scrub";
import { checkRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Flattens a UIMessage's text parts into a plain string. */
function textOf(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

export async function POST(req: Request) {
  // 1. Rate limit. Rejected requests never reach the scrubber or the model.
  const { allowed, retryAfter } = checkRateLimit(clientIp(req));
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید." }),
      {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": String(retryAfter) },
      },
    );
  }

  const { messages }: { messages: UIMessage[] } = await req.json();
  if (!messages?.length) {
    return new Response(JSON.stringify({ error: "no messages" }), { status: 400 });
  }

  // 2. Scrub every message before anything else touches it. Applied to the
  //    whole history, not just the latest turn: a key pasted three messages
  //    ago is still in the outbound request.
  const scrubbed: UIMessage[] = messages.map((m) => ({
    ...m,
    parts: m.parts.map((p) =>
      p.type === "text" ? { ...p, text: scrub(p.text) } : p,
    ),
  }));

  // 3. Retrieve.
  const userMessages = scrubbed.filter((m) => m.role === "user");
  const current = textOf(userMessages[userMessages.length - 1] ?? scrubbed[scrubbed.length - 1]);
  const previous = userMessages.length > 1 ? textOf(userMessages[userMessages.length - 2]) : undefined;
  const hits = search(retrievalQuery(current, previous), 6);

  // One citation per page, in rank order — several chunks routinely come from
  // the same document and a repeated badge looks broken.
  const seen = new Set<string>();
  const sources = hits
    .filter((h) => !seen.has(h.chunk.url) && seen.add(h.chunk.url))
    .map((h) => ({ url: h.chunk.url, title: h.chunk.pageTitle }));

  // 4. Stream.
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      for (const [i, s] of sources.entries()) {
        writer.write({
          type: "source-url",
          sourceId: `src-${i}`,
          url: s.url,
          title: s.title,
        });
      }

      const result = streamText({
        model: chatModel(),
        instructions: SYSTEM_PROMPT,
        messages: [
          ...(await convertToModelMessages(scrubbed)),
          { role: "system" as const, content: buildContext(hits) },
        ],
      });

      writer.merge(toUIMessageStream({ stream: result.stream }));
    },
  });

  return createUIMessageStreamResponse({ stream });
}
```

Note: `execute` must be `async` for the `await convertToModelMessages(...)` call. If TypeScript complains, change `execute: ({ writer }) =>` to `execute: async ({ writer }) =>`.

- [ ] **Step 4: Create the local environment file**

Create `.env.local` (already gitignored via `.env*`):

```bash
AI_BASE_URL=https://ai.liara.ir/api/v1/<your-endpoint-id>
AI_API_KEY=<your-key>
AI_MODEL=openai/gpt-4o-mini
```

- [ ] **Step 5: Verify the endpoint end-to-end**

```bash
npm run dev
```

In a second terminal:

```bash
curl -sN http://localhost:3000/api/chat \
  -H 'content-type: application/json' \
  -d '{"messages":[{"id":"1","role":"user","parts":[{"type":"text","text":"فایل liara.json چیست؟"}]}]}' \
  | head -30
```

Expected: a `text/event-stream` beginning with `source-url` parts carrying real `docs.liara.ir` URLs, followed by `text-delta` parts.

A 404 from the provider means the Responses API is being hit — confirm `provider.chat(id)` is used in `src/lib/ai/provider.ts`.

- [ ] **Step 6: Verify rate limiting fires**

```bash
for i in $(seq 1 25); do
  curl -s -o /dev/null -w "%{http_code} " http://localhost:3000/api/chat \
    -H 'content-type: application/json' \
    -d '{"messages":[{"id":"1","role":"user","parts":[{"type":"text","text":"سلام"}]}]}'
done; echo
```

Expected: a run of `200` followed by `429` once 20 requests land inside the window.

- [ ] **Step 7: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npx eslint src --max-warnings=0
git add src/lib/ai src/app/api
git commit -m "feat: add grounded streaming chat endpoint"
```

---

### Task 8: Wire the interface to the live endpoint

Replaces simulated streaming with `useChat`. The existing presentational components are reused unchanged except where noted.

**Files:**
- Create: `src/lib/chips.ts`
- Test: `src/lib/chips.test.ts`
- Rewrite: `src/app/page.tsx`
- Modify: `src/components/chat/MessageBubble.tsx`
- Delete: `src/lib/mock.ts`

**Interfaces:**
- Consumes: `POST /api/chat` (Task 7)
- Produces: `splitChips(text): { body: string; chips: string[] }`

- [ ] **Step 1: Write the failing chip-parsing test**

Create `src/lib/chips.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { splitChips } from "./chips";

describe("splitChips", () => {
  it("extracts chips and strips the marker from the body", () => {
    const r = splitChips("پاسخ اینجاست.\n<<<NEXT: اول | دوم | سوم >>>");
    expect(r.body).toBe("پاسخ اینجاست.");
    expect(r.chips).toEqual(["اول", "دوم", "سوم"]);
  });

  it("handles two suggestions", () => {
    expect(splitChips("متن\n<<<NEXT: یک | دو >>>").chips).toEqual(["یک", "دو"]);
  });

  it("returns no chips when the marker is absent", () => {
    const r = splitChips("فقط یک پاسخ ساده");
    expect(r.body).toBe("فقط یک پاسخ ساده");
    expect(r.chips).toEqual([]);
  });

  it("hides a partially streamed marker from the body", () => {
    // Mid-stream the marker arrives a character at a time and must never be
    // rendered as prose.
    expect(splitChips("پاسخ\n<<<NEXT: اول |").body).toBe("پاسخ");
    expect(splitChips("پاسخ\n<<<N").body).toBe("پاسخ");
    expect(splitChips("پاسخ\n<<<").body).toBe("پاسخ");
  });

  it("returns no chips for a partial marker", () => {
    expect(splitChips("پاسخ\n<<<NEXT: اول |").chips).toEqual([]);
  });

  it("ignores empty suggestions", () => {
    expect(splitChips("م\n<<<NEXT: یک |  | سه >>>").chips).toEqual(["یک", "سه"]);
  });

  it("caps at three suggestions", () => {
    expect(splitChips("م\n<<<NEXT: ۱ | ۲ | ۳ | ۴ | ۵ >>>").chips).toHaveLength(3);
  });

  it("leaves a code block containing angle brackets alone", () => {
    const t = "```js\nif (a <<< b) {}\n```";
    expect(splitChips(t).body).toBe(t);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/lib/chips.test.ts`
Expected: FAIL — cannot resolve `./chips`.

- [ ] **Step 3: Implement chip parsing**

Create `src/lib/chips.ts`:

```ts
/**
 * Splits the trailing follow-up marker out of an assistant message.
 *
 * The marker streams in character by character, so a partial marker has to be
 * hidden from the body as it arrives — otherwise the reader watches `<<<NEXT:`
 * type itself out at the end of every answer.
 *
 * A malformed or missing marker yields no chips and an unmodified body. That
 * is the accepted failure mode: the answer is never damaged by chip parsing.
 */

const COMPLETE = /\n?<<<NEXT:([\s\S]*?)>>>\s*$/;
/** A prefix of the opening marker at the very end of the text. */
const PARTIAL = /\n?<{1,3}(?:N(?:E(?:X(?:T(?::[^>]*)?)?)?)?)?$/;

export function splitChips(text: string): { body: string; chips: string[] } {
  const complete = text.match(COMPLETE);
  if (complete) {
    const chips = complete[1]
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);
    return { body: text.slice(0, complete.index).trimEnd(), chips };
  }

  const partial = text.match(PARTIAL);
  if (partial) {
    return { body: text.slice(0, partial.index).trimEnd(), chips: [] };
  }

  return { body: text, chips: [] };
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/lib/chips.test.ts`
Expected: PASS, 8 tests.

The code-block case is the one to watch: `if (a <<< b) {}` must not be treated as a partial marker, which is why `PARTIAL` is anchored to the end of the string.

- [ ] **Step 5: Rewrite the page against `useChat`**

Replace `src/app/page.tsx` entirely:

```tsx
"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Header } from "@/components/chat/Header";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { Composer } from "@/components/chat/Composer";
import { Chip } from "@/components/chat/Chip";
import { splitChips } from "@/lib/chips";
import type { Message, Source } from "@/components/chat/MessageBubble";

const QUICK_ACTIONS = [
  { label: "عیب‌یابی لاگ خطا", prompt: "این لاگ خطای استقرار را بررسی کن:\n" },
  { label: "ساخت liara.json", prompt: "برای پروژه Next.js من liara.json بساز" },
  { label: "دستورات CLI", prompt: "دستورات اصلی Liara CLI را نشان بده" },
  { label: "اتصال دیتابیس", prompt: "چطور به دیتابیس MySQL در لیارا وصل شوم؟" },
];

export default function Page() {
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const busy = status !== "ready" && status !== "error";

  // Adapt AI SDK UIMessages into the shape the presentational components
  // already accept, so the chat rendering did not have to change.
  const view: Message[] = messages.map((m) => {
    const raw = m.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join("");
    const { body, chips } = splitChips(raw);

    const sources: Source[] = m.parts
      .filter((p) => p.type === "source-url")
      .map((p) => {
        const s = p as { url: string; title?: string };
        return { url: s.url, title: s.title ?? s.url };
      });

    return {
      id: m.id,
      role: m.role === "user" ? "user" : "assistant",
      content: m.role === "user" ? raw : body,
      sources: m.role === "user" ? [] : sources,
      suggestions: m.role === "user" ? [] : chips,
    };
  });

  function send(text: string) {
    if (!text.trim() || busy) return;
    sendMessage({ text });
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />

      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 pt-6 pb-32">
          {view.length === 0 ? (
            <EmptyState onPick={send} />
          ) : (
            <div className="space-y-7">
              {view.map((m, i) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  streaming={busy && i === view.length - 1 && m.role === "assistant"}
                  onSuggestion={send}
                />
              ))}
            </div>
          )}

          {error ? (
            <p className="mt-6 rounded-xl border border-red-500/25 bg-red-500/[0.07] px-4 py-3 text-sm text-red-300">
              خطا در ارتباط با سرویس. لطفاً دوباره تلاش کنید.
            </p>
          ) : null}
        </div>
      </main>

      <Composer onSend={send} disabled={busy} />
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="pt-16 pb-8 text-center">
      <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl border border-brand/20 bg-brand/[0.07]">
        <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
          <path d="M16 6.5 25 11.5 16 16.5 7 11.5 16 6.5Z" fill="#00e5b7" />
          <path d="M16 14 25 19 16 24 7 19 16 14Z" fill="#38bdf8" opacity="0.6" />
        </svg>
      </div>

      <h2 className="text-2xl font-bold text-ink">روی لیارا چه چیزی مستقر می‌کنید؟</h2>
      <p className="mx-auto mt-3 max-w-md text-[15px] leading-7 text-ink-2">
        پیکربندی بسازید، دستورات <span className="bidi-isolate">CLI</span> را بگیرید،
        یا لاگ خطای استقرار را بچسبانید تا ریشه مشکل را پیدا کنیم — همه بر پایه
        مستندات رسمی لیارا.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {QUICK_ACTIONS.map((a) => (
          <Chip key={a.label} onClick={() => onPick(a.prompt)}>
            {a.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Move the message types out of the deleted mock**

`MessageBubble` and `SourceBadges` currently import their types from `src/lib/mock.ts`. In `src/components/chat/MessageBubble.tsx`, replace the `import type { Message } from "@/lib/mock";` line with local exported types:

```ts
export type Source = { title: string; url: string };

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  suggestions?: string[];
};
```

In `src/components/chat/SourceBadges.tsx`, change `import type { Source } from "@/lib/mock";` to `import type { Source } from "./MessageBubble";`.

Then delete the mock:

```bash
rm src/lib/mock.ts
```

- [ ] **Step 7: Verify in the browser**

```bash
npm run dev
```

Open `http://localhost:3000` and confirm:
- Asking "فایل liara.json چیست؟" streams a Persian answer.
- Citation badges appear and link to real `docs.liara.ir` pages.
- Two or three follow-up chips appear, and `<<<NEXT:` never appears as visible text at any point during streaming.
- A `json` code block shows both copy and download.
- Clicking a chip sends that follow-up.

- [ ] **Step 8: Typecheck, lint, test, commit**

```bash
npx tsc --noEmit && npx eslint src --max-warnings=0 && npm test
git add -A
git commit -m "feat: wire chat interface to live retrieval endpoint"
```

---

### Task 9: Deployment

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `liara.json`
- Create: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above
- Produces: a deployable image

- [ ] **Step 1: Write the Dockerfile**

Create `Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# The retrieval index is read at runtime with fs, so it is not bundled into
# the standalone output and must be copied explicitly.
COPY --from=builder --chown=nextjs:nodejs /app/data ./data

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 2: Write `.dockerignore`**

Create `.dockerignore`:

```
node_modules
.next
.git
.env*
docs
.playwright-mcp
```

- [ ] **Step 3: Write the Liara config**

Create `liara.json`:

```json
{
  "platform": "docker",
  "port": 3000,
  "build": {
    "location": "germany"
  }
}
```

Note: `app` is intentionally omitted so the app name is supplied at deploy time with `--app`, keeping the repository free of one developer's app name.

- [ ] **Step 4: Write `.env.example`**

Create `.env.example`:

```bash
# OpenAI-compatible endpoint. Liara AI, a proxy, or OpenAI all work.
AI_BASE_URL=https://ai.liara.ir/api/v1/<endpoint-id>
AI_API_KEY=
AI_MODEL=openai/gpt-4o-mini

# Only needed to regenerate data/docs-index.json via `npm run ingest`.
# Not required at runtime.
DOCS_PATH=/path/to/liara-docs
```

- [ ] **Step 5: Verify the image builds and runs**

```bash
docker build -t liara-copilot .
docker run --rm -p 3000:3000 \
  -e AI_BASE_URL="$AI_BASE_URL" -e AI_API_KEY="$AI_API_KEY" -e AI_MODEL="$AI_MODEL" \
  liara-copilot
```

Then confirm the container serves a real answer:

```bash
curl -sN http://localhost:3000/api/chat \
  -H 'content-type: application/json' \
  -d '{"messages":[{"id":"1","role":"user","parts":[{"type":"text","text":"liara.json چیست؟"}]}]}' | head -20
```

Expected: `source-url` parts followed by text deltas. An error mentioning `docs-index.json` means the `COPY /app/data` line is missing.

- [ ] **Step 6: Write the README**

Replace `README.md`:

````markdown
# Liara Copilot

دستیار هوش مصنوعی برای استقرار، پیکربندی و عیب‌یابی برنامه‌ها روی ابر لیارا،
مبتنی بر مستندات رسمی لیارا.

An AI assistant for deploying, configuring, and troubleshooting applications on
Liara Cloud, grounded in Liara's official documentation.

## How it works

A build-time script parses Liara's MDX docs into a committed JSON chunk index.
Each request is rate-limited by IP, scrubbed of secrets, matched against the
index with BM25, and answered by an OpenAI-compatible model with the retrieved
chunks injected into the prompt. Citations come from chunk metadata, never from
model output, so a cited link always points at a page that actually exists.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in AI_BASE_URL, AI_API_KEY, AI_MODEL
npm run dev
```

## Regenerating the docs index

The index is committed, so this is only needed when the upstream docs change:

```bash
DOCS_PATH=/path/to/liara-docs npm run ingest
```

## Tests

```bash
npm test
```

## Deployment

```bash
liara deploy --app <your-app-name>
```

Set `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL` in the Liara console.

## Known limitations

- Rate limiting is in-memory, so it is per instance and resets on deploy.
- The index is a point-in-time snapshot; doc changes need a re-ingest.
- BM25 does not match paraphrase, so an unusually worded Persian question may
  retrieve poorly. Hybrid retrieval is the first planned improvement.
- No conversation persistence; reloading clears the chat.
````

- [ ] **Step 7: Full verification and commit**

```bash
npm test && npx tsc --noEmit && npx eslint src --max-warnings=0 && npm run build
git add -A
git commit -m "feat: add Docker and Liara deployment configuration"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §3.1 URL derivation | 4 |
| §3.2 content shape | 4 |
| §4.1 parse order | 4 |
| §4.2 tab splitting | 4 |
| §4.3 chunking | 4 |
| §4.4 index artifact + title boilerplate + section fallback | 4 |
| §5.1 tokenization | 2 |
| §5.2 scoring, top-6, page dedup | 3, 5, 7 |
| §5.3 no tool-calling retrieval, previous-message folding | 7 |
| §6 pipeline order | 7 |
| §6.1 provider | 7 |
| §6.2 system prompt | 7 |
| §6.3 structured output | already built (`CodeBlock`) |
| §6.4 chips | 8 |
| §7 interface | already built; wired in 8 |
| §8 deployment | 9 |
| §9 module boundaries | matches the File Structure table |
| §10 testing | 1, 2, 3, 4, 5, 6, 8 |
| §11 known limitations | documented in 6 and the README in 9 |

No gaps.

**Placeholder scan:** No TBDs. Every code step carries complete code. The only angle-bracket placeholders are in `.env.example` and deploy commands, where a per-user secret or app name is genuinely required.

**Type consistency:** `Chunk` and `SearchHit` are defined once in Task 3 and imported everywhere. `search()` returns `SearchHit[]` in Task 5 and is consumed as such in Task 7. `Message` and `Source` move from `src/lib/mock.ts` to `MessageBubble.tsx` in Task 8 Step 6, and `SourceBadges` is repointed in the same step — checked, because deleting the mock without that move breaks the build.
