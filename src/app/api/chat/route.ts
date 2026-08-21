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

  // Converted ahead of createUIMessageStream so execute can stay synchronous.
  const modelMessages = await convertToModelMessages(scrubbed);

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
          ...modelMessages,
          { role: "system" as const, content: buildContext(hits) },
        ],
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
