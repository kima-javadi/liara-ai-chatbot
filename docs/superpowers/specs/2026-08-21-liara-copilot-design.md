# Liara Copilot — Design

**Date:** 2026-08-21
**Status:** Approved for planning
**Context:** 12-hour hackathon build. Single repository, deployed to Liara PaaS.

## 1. Purpose

An AI assistant that helps developers deploy, configure, and troubleshoot
applications on Liara Cloud, answering strictly from Liara's official
documentation and citing the exact pages it used.

Three capabilities, delivered through one chat surface:

- Answer technical questions from the docs, with source links.
- Generate `liara.json` files and Liara CLI commands for a stated stack.
- Diagnose pasted deployment error logs and give step-by-step fixes.

## 2. Constraints and non-goals

Decided and fixed:

- No authentication, no multi-tenancy.
- No database. No server-side persistence of chats or logs.
- Chat state lives in client memory for the session and is lost on reload.
- Rate limiting is in-memory per IP, and therefore per instance. It resets
  on deploy. Acceptable for a hackathon; stated here so it is a known
  limitation rather than a discovered one.
- BM25 only. No embeddings, no vector store. Hybrid retrieval is a
  stretch goal explicitly out of scope for the first build.

## 3. Documentation source

The corpus is Liara's docs site repository, present locally at a path
supplied via `DOCS_PATH`. It is a Next.js pages-router site containing
1,143 `.mdx` files under `src/pages/`.

### 3.1 URL derivation

The file path maps deterministically to the public URL:

```
src/pages/paas/liarajson.mdx  ->  https://docs.liara.ir/paas/liarajson
```

Rule: strip the `src/pages/` prefix and the `.mdx` extension, prepend
`https://docs.liara.ir/`. A file named `index.mdx` maps to its directory.

This is the entire basis for the "verified links" requirement. Every chunk
carries the URL computed from its own file path. The model is never asked
to produce a URL, and never permitted to.

### 3.2 Content shape

The files are not Markdown. They are MDX with heavy JSX. Component usage
across the corpus:

| Component | Count | Role |
|---|---|---|
| `<Important>` | 8666 | inline emphasis around identifiers |
| `<Highlight className="lang">` | 3731 | code blocks |
| `<Alert variant="…">` | 1595 | callouts |
| `<Section id="…" title="…" />` | 1301 | section headings |
| `<Head>` / `<Layout>` | ~1143 each | page wrapper, title metadata |
| `<Link>` | 808 | internal links |
| `<Tabs tabs={[…]} content={[…]}>` | 397 | per-platform variants |
| `<Card>`, `<Step>`, `<Table>`, `<Asciinema>` | <400 combined | structural |

Two structural facts drive the ingestion design:

- Headings are `<Section title="…" />`, not Markdown `##`.
- Code lives inside template literals: `` <Highlight className="bash">{`liara init`}</Highlight> ``.

Prose is Persian (RTL); code and identifiers are English (LTR). Both appear
within single paragraphs.

## 4. Ingestion

A build-time script, `scripts/ingest.mjs`, reads `DOCS_PATH` and writes
`data/docs-index.json`. It is run manually, never at request time or
container boot.

### 4.1 Parsing strategy

Targeted regex over the MDX source, not an MDX/estree AST parse. The
component vocabulary is small and consistent, and `<Tabs>` holds JSX inside
an array-valued prop — a shape that is disproportionately painful to parse
properly. A regex miss degrades a chunk's text quality; it does not crash
the build.

**Order of operations matters.** Code blocks are extracted and replaced with
placeholders *before* any component stripping. Otherwise C# `<IActionResult>`
and Apache `<IfModule>` appearing inside code get mangled as if they were MDX
components. This is a confirmed hazard in the current corpus, not a
hypothetical.

Steps per file:

1. Drop `import` statements, `<Head>`, and `<Layout>` open/close tags.
2. Capture the page title from `<title>` inside `<Head>`, falling back to
   the first `# ` heading.
3. Extract every `<Highlight className="lang">{\`…\`}</Highlight>` body into
   a placeholder table, recording its language.
4. Split `<Tabs>` into per-tab fragments (section 4.2).
5. Strip remaining JSX tags, unwrap `<Important>` and `<Alert>` to their text
   content, and collapse whitespace.
6. Restore code placeholders as fenced blocks with their language.

### 4.2 Tab splitting

`<Tabs tabs={["NodeJS","Laravel",…]} content={[…]}>` pairs a label array with
a content array by index. Each pair becomes its own chunk, tagged with the
tab label as a `platform` field, and the label is prepended to the chunk text
so it is reachable by keyword search.

Without this, a page like `paas/liarajson` yields one chunk containing eleven
different `liara init` invocations, and a question about Laravel can retrieve
the Node command. 329 of 1,143 files use `<Tabs>`, concentrated in `paas/`,
which is the highest-traffic area for deployment questions.

`<HighlightTabs>` (20 occurrences) follows the same shape and uses the same
splitting logic.

### 4.3 Chunking

Split on `<Section>` boundaries. Each chunk records:

```
{ id, url, pageTitle, sectionTitle, platform?, text, code[] }
```

Sections longer than roughly 1,500 characters are split on paragraph
boundaries, with the page and section titles repeated into each part so the
context survives the split. Chunks under ~80 characters of prose are dropped
unless they contain code.

### 4.4 Index artifact

`data/docs-index.json` is committed to the repository. The Docker build
therefore never needs the docs checkout, and `liara deploy` remains a single
command with no extra build inputs.

Measured against the real corpus (2026-08-21 spike): 1,143 files produce
2,873 section chunks plus an estimated 1,067 tab-derived chunks, for roughly
3,940 total, carrying 3,626 code blocks. The artifact is **5.4 MB raw, 0.96 MB
gzipped**. All 1,143 derived URLs were well-formed and no chunk leaked raw
MDX, confirming the mask-code-before-strip ordering. At this size the artifact
is committed as plain JSON with no size mitigations required.

Two ingestion details the spike surfaced:

- Page titles carry site boilerplate (`مستندات … - لیارا`). Strip the leading
  `مستندات ` and the trailing ` - لیارا` so the boilerplate does not inflate
  term frequencies across every document.
- Some `<Section>` tags carry no `title` attribute. Section titles need a
  positional fallback rather than assuming one title per split boundary.

## 5. Retrieval

### 5.1 Tokenization

Persian normalization is required for BM25 to work at all on this corpus:

- Arabic `ي` → Persian `ی`, Arabic `ك` → Persian `ک`.
- Zero-width non-joiner treated as a word separator.
- Arabic-Indic and Persian digits folded to ASCII.
- Diacritics stripped.
- English tokens lowercased.

Technical tokens are preserved intact rather than shattered on punctuation:
`liara.json`, `--build-location`, `next.config.mjs` must each survive as a
single token, and also emit their split parts so both query styles match.

A Persian stopword list of roughly 100 words is applied. No stemming — the
cost/benefit does not justify it inside the time budget, and Persian
stemming errors on technical text tend to be worse than no stemming.

### 5.2 Scoring

Standard BM25 (`k1=1.2`, `b=0.75`) over the chunk corpus. The index is built
once in module scope on first request and reused for the process lifetime.
Build time over ~3,900 chunks is well under a second and happens
on a single cold request, not on every request.

Top 6 chunks are injected into the prompt. Chunks from the same page are
merged in presentation so a citation list does not repeat one URL.

### 5.3 No tool-calling retrieval

Retrieval runs on every user message and the results are injected directly
into the prompt. The model is not given a search tool.

This is deliberately less clever than letting the model decide when to
search. It is chosen because it is always grounded, it removes an entire
class of failure (the model declining to search, or searching with a bad
query), and it saves a round trip on every turn. The cost is weaker handling
of follow-ups that reference earlier context without restating keywords;
mitigated by including the previous user message in the retrieval query.

## 6. Chat endpoint

`app/api/chat/route.ts`, Node runtime, streaming.

Pipeline order, which is also the security order:

1. **Rate limit** by IP. Sliding window in memory. Rejected requests never
   reach the scrubber or the model.
2. **Scrub secrets.** Regex replacement of API keys, bearer tokens, database
   connection strings with embedded passwords, and PEM private key blocks,
   each replaced with `[REDACTED]`. This runs server-side, before the text
   reaches the model — not merely before display. Nothing is persisted
   either way, so the scrubber's only job is keeping secrets out of the
   provider request.
3. **Retrieve** top chunks for the scrubbed query.
4. **Stream** via `streamText` from the AI SDK.

### 6.1 Model provider

`@ai-sdk/openai` configured as an OpenAI-compatible provider, with `baseURL`
and `apiKey` read from `AI_BASE_URL` and `AI_API_KEY`. The model id is also
an environment variable. No provider-specific behavior anywhere in the code,
so pointing at Liara's AI endpoint, a proxy, or OpenAI itself is a
configuration change with no code change.

### 6.2 System prompt

Instructs the model to answer only from the supplied context; to say plainly
when the documentation does not cover something rather than improvising; to
cite only URLs present in the injected context; and to answer in the
language the user wrote in.

### 6.3 Structured output

`liara.json` files and CLI commands are emitted as ordinary fenced code
blocks. The client renderer attaches copy and download affordances when the
language is `json` and the content parses as valid JSON.

No tool call, no custom stream protocol. Same result on screen, nothing extra
to break during a live demo.

### 6.4 Next-step chips

The model appends a single trailing marker in a fixed format listing two to
three suggested follow-ups. The client parses it out of the stream, hides it
from the rendered message, and renders the suggestions as clickable chips.

If the marker is missing or malformed, no chips render and the answer is
unaffected. This is the accepted failure mode; the alternative — a second
model call per message — was rejected for adding a round trip to every turn.

## 7. Interface

Single chat surface. No tabs, no separate tools.

- Quick-action chips seed the three headline capabilities: diagnose an error
  log, generate `liara.json`, show CLI commands.
- RTL layout for Persian prose, with code blocks and inline identifiers
  forced LTR. Direction is set per block, not per page, because both appear
  inside single paragraphs.
- Syntax-highlighted code blocks with one-click copy.
- Token-by-token streaming.
- Source links rendered as a citation list at the end of each answer, built
  from chunk metadata rather than from model output.

## 8. Deployment

- `Dockerfile` — multi-stage, Next.js standalone output.
- `liara.json` — platform `docker`, port 3000.
- Environment: `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`.
- `DOCS_PATH` is needed only for `npm run ingest`, never at runtime.

Deployment is `liara deploy` with no additional build inputs, because the
index is committed.

## 9. Module boundaries

| Module | Responsibility | Depends on |
|---|---|---|
| `scripts/ingest.mjs` | MDX → chunks + URLs | filesystem, `DOCS_PATH` |
| `lib/retrieval/tokenize.ts` | Persian/technical tokenization | nothing |
| `lib/retrieval/bm25.ts` | scoring over a chunk array | tokenize |
| `lib/retrieval/index.ts` | load artifact, expose `search()` | bm25, artifact |
| `lib/security/scrub.ts` | secret redaction | nothing |
| `lib/security/rate-limit.ts` | per-IP sliding window | nothing |
| `app/api/chat/route.ts` | orchestration and streaming | all of the above |
| `components/chat/*` | rendering, RTL, copy, chips | nothing server-side |

Tokenization, scrubbing, and BM25 scoring are pure functions over strings and
arrays. They are the parts most likely to be wrong and the parts cheapest to
test directly, which is where test effort goes.

## 10. Testing

Time budget is 12 hours, so testing is targeted rather than comprehensive:

- **Tokenizer** — Persian normalization cases, technical tokens surviving
  intact, digit folding.
- **Ingestion** — run against the real corpus and assert: every chunk has a
  well-formed `docs.liara.ir` URL, tab-derived chunks carry a platform label,
  no chunk contains a raw `<Highlight` or `import` string.
- **Scrubber** — each secret pattern, plus confirmation that ordinary code
  and prose pass through unmodified.
- **Retrieval smoke set** — roughly ten known question/expected-page pairs
  in both Persian and English, asserting the right page appears in the top
  results. This is the honest measure of whether the thing works.

## 11. Known limitations

Stated deliberately, not discovered later:

- Rate limiting is per instance and resets on deploy.
- The index is a point-in-time snapshot; docs changes require re-running
  ingestion and redeploying.
- BM25 does not match paraphrase. A Persian question using different
  vocabulary than the docs may retrieve poorly. This is the single most
  likely quality failure, and the reason hybrid retrieval is the first
  stretch goal.
- No conversation persistence; reload loses history.
