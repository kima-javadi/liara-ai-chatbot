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

When retrieval returns nothing, or returns hits below a relevance floor, the
context tells the model to answer from general knowledge and say that it did —
a weak match is not evidence that a question is off topic. Refusal is reserved
for questions outside cloud and deployment altogether. A request that hinges on
an unstated parameter (which framework, which database) gets one round of
clarifying questions with clickable options rather than a generic tutorial.

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
- The tokenizer does no Persian morphology, so an inflected query term matches
  nothing at all: `خدماتی` and `داره` have a document frequency of zero in a
  corpus that writes `خدمات` and `ارائه می‌دهد`. Broad questions about the
  platform are covered by a dedicated intent in `retrievalQuery`, but the
  general case needs stemming. A conservative suffix-stripper was measured and
  held every current ranking except that stripping a bare `ی` over-stems
  (`اختصاصی` → `اختصاص` promotes an unrelated htaccess page over the domain
  guide), so it was left out rather than shipped half-tuned.
- No conversation persistence; reloading clears the chat.
