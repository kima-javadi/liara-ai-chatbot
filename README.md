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
