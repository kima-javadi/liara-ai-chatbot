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
import { scrubParts } from "@/lib/security/scrub";
import { checkRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * How many reverse proxies in front of this app are trusted to have appended
 * to `x-forwarded-for`. Liara PaaS puts exactly one in front of the container,
 * hence the default of 1. It is an env var rather than a constant so a change
 * in topology (an extra CDN, a load balancer) is a config change instead of a
 * silent, invisible mis-keying of the rate limiter.
 */
const TRUSTED_PROXY_HOPS = Math.max(
  1,
  Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "1", 10) || 1,
);

/** Body size ceiling. See the 413 branch in POST for the reasoning. */
const MAX_BODY_BYTES = 128 * 1024;

/**
 * The rate-limit key.
 *
 * `x-forwarded-for` is append-only: each proxy appends the address it received
 * the connection from. Everything to the LEFT of the entry our own trusted
 * proxy appended is text the client wrote, so reading the left-most entry (as
 * this did before) let any caller rotate the header and get unlimited access to
 * an unauthenticated, metered LLM endpoint. Counting TRUSTED_PROXY_HOPS in from
 * the right lands on the entry the trusted proxy itself wrote.
 *
 * `x-real-ip` is deliberately NOT used as a fallback: it is a single value with
 * no provenance, so a caller who simply omits `x-forwarded-for` could forge it
 * and reopen the same bypass. With no forwarded-for header the request did not
 * arrive through the expected proxy, so it shares one conservative bucket.
 *
 * That bucket is not a practical availability risk here: Liara's own platform
 * documentation states that every request reaches the container through their
 * reverse proxy, and their per-framework TrustedProxies guides read the client
 * address out of `x-forwarded-for` (see paas/flask/how-tos/set-trusted-proxies
 * and paas/nodejs/how-tos/configure-trusted-proxy/about). One hop, header
 * always present. Note that those same guides take `split(',')[0]` — the
 * left-most, client-controlled entry — which is exactly the bypass above; this
 * function deliberately does not follow that example.
 */
function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (!fwd) return "unknown";
  const hops = fwd
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!hops.length) return "unknown";
  return hops[Math.max(0, hops.length - TRUSTED_PROXY_HOPS)];
}

function tooLarge(): Response {
  return new Response(
    JSON.stringify({ error: "حجم درخواست بیش از حد مجاز است." }),
    { status: 413, headers: { "content-type": "application/json" } },
  );
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

  // 2. Cap the body. Retrieval tokenizes the whole query and BM25 scans 4,000
  //    chunks per distinct term, all synchronously on a single Node process, so
  //    an unbounded body is a denial-of-service lever against every other
  //    request. 128 KB is far above any real conversation (the longest smoke
  //    transcript is a few KB) and far below the megabyte-scale payloads that
  //    were measured blocking the loop for seconds.
  const contentLength = Number.parseInt(req.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return tooLarge();
  }
  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return tooLarge();
  }

  let messages: UIMessage[] | undefined;
  try {
    ({ messages } = JSON.parse(raw) as { messages?: UIMessage[] });
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400 });
  }
  if (!messages?.length) {
    return new Response(JSON.stringify({ error: "no messages" }), { status: 400 });
  }

  // 3. Scrub every message before anything else touches it. Applied to the
  //    whole history, not just the latest turn: a key pasted three messages
  //    ago is still in the outbound request. And applied to every string a
  //    part carries, not just `text`: `file` (data: URLs) and `reasoning`
  //    parts also survive convertToModelMessages into the provider request.
  //    Parts are rewritten, never dropped — an unknown part type still
  //    reaches the model, just with its strings redacted.
  const scrubbed: UIMessage[] = messages.map((m) => ({
    ...m,
    parts: scrubParts(m.parts),
  }));

  // 4. Retrieve.
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

  // Converted ahead of createUIMessageStream so execute can stay synchronous.
  const modelMessages = await convertToModelMessages(scrubbed);

  // 5. Stream.
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

      // The retrieved context rides in `instructions`, not as a system message:
      // AI SDK v7 rejects role "system" inside `messages` outright. Appending
      // it here also keeps the grounding ahead of the conversation, so a long
      // chat cannot push the documentation out of the model's attention.
      const result = streamText({
        model: chatModel(),
        instructions: `${SYSTEM_PROMPT}\n\n${buildContext(hits)}`,
        messages: modelMessages,
      });

      // sendStart: false because the source-url parts above already opened
      // this assistant message. Letting the merged stream emit its own `start`
      // makes the client render a second assistant turn with the same sources.
      writer.merge(
        toUIMessageStream({ stream: result.stream, sendStart: false }),
      );
    },
  });

  return createUIMessageStreamResponse({ stream });
}
