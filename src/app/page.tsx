"use client";

import { useCallback, useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Header } from "@/components/chat/Header";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { Composer } from "@/components/chat/Composer";
import { Chip } from "@/components/chat/Chip";
import { splitChips } from "@/lib/chips";
import type { Message, Source } from "@/components/chat/MessageBubble";

// Module scope, not inline in the hook call: a transport rebuilt on every
// render makes useChat re-subscribe to the in-flight stream, which appends a
// second assistant message carrying the same source parts.
const transport = new DefaultChatTransport({ api: "/api/chat" });

/** Breathing room left above the pinned question, in px. */
const ANCHOR_GAP = 16;

/** Keys that scroll the page, and so hand control back to the reader. */
const SCROLL_KEYS = [
  "PageUp",
  "PageDown",
  "Home",
  "End",
  "ArrowUp",
  "ArrowDown",
  " ",
];

const QUICK_ACTIONS = [
  { label: "عیب‌یابی لاگ خطا", prompt: "این لاگ خطای استقرار را بررسی کن:\n" },
  { label: "ساخت liara.json", prompt: "برای پروژه Next.js من liara.json بساز" },
  { label: "دستورات CLI", prompt: "دستورات اصلی Liara CLI را نشان بده" },
  { label: "اتصال دیتابیس", prompt: "چطور به دیتابیس MySQL در لیارا وصل شوم؟" },
];

export default function Page() {
  const { messages, sendMessage, status, error } = useChat({ transport });
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

  // Autoscroll: park the new question at the top of the viewport and leave it
  // there while the answer streams in underneath.
  //
  // This followed the bottom of the page before, which is the wrong end of a
  // long answer to show: it put the closing line on screen and the first
  // line — the part that actually answers the question — above the fold, so
  // reading started with a scroll back up.
  //
  // The pin is re-applied on every layout change rather than fired once. When
  // the question lands the assistant message is still empty, the page is too
  // short to lift it to the top, and the browser clamps the request; the
  // target only becomes reachable once the answer has streamed in. Re-applying
  // converges on it and then stops moving on its own, because the answer grows
  // *below* the anchor and so never shifts it.
  //
  // A short answer never makes the page tall enough to lift the question all
  // the way up. That is left alone rather than padded out with a spacer: the
  // whole exchange is already on screen, which is what the scroll was for, and
  // a spacer would buy the alignment with a screenful of dead space under
  // every short reply.
  //
  // Instant, not smooth: a smooth scroll emits scroll events at intermediate
  // positions that the gesture listeners below would then have to tell apart
  // from a reader's own scrolling. It also sidesteps reduced-motion entirely.
  //
  // Driven by a ResizeObserver rather than an effect keyed on the message
  // text. Keying on text tracked the stream but stopped 116px short at the
  // end, every time: the last of the page's growth — the chip row appearing
  // once splitChips sees a complete marker, and the streaming caret going
  // away — arrives in a commit where the text has already settled, so the
  // effect never re-ran. Watching the layout catches every source of growth
  // without enumerating them. Scrolling does not resize the body, so this
  // cannot loop.
  const stick = useRef(true);
  const anchor = useRef<HTMLDivElement | null>(null);
  const userTurns = messages.reduce((n, m) => (m.role === "user" ? n + 1 : n), 0);

  const pin = useCallback(() => {
    const el = anchor.current;
    if (!stick.current || !el) return;
    // The header is sticky, so the top of the viewport is not the top of the
    // readable area. Measured rather than hardcoded, to track the header.
    const header =
      document.querySelector("header")?.getBoundingClientRect().height ?? 0;
    window.scrollTo({
      top: el.getBoundingClientRect().top + window.scrollY - header - ANCHOR_GAP,
    });
  }, []);

  useEffect(() => {
    stick.current = true;
    pin();
  }, [userTurns, pin]);

  useEffect(() => {
    const observer = new ResizeObserver(pin);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [pin]);

  // Any scroll gesture hands the page back to the reader until they ask the
  // next question. Nothing re-arms the pin in between — unlike the bottom
  // follow this replaced, the anchor is a fixed point rather than "wherever
  // the page currently ends", so re-arming on the way past it would yank the
  // page out from under whatever the reader was doing.
  //
  // Bound to wheel/touch/keys rather than to `scroll`: a `scroll` event
  // carries no hint of who caused it, and the pin above is itself a scroll —
  // the handler would read its own work as the reader scrolling away.
  useEffect(() => {
    const release = () => {
      stick.current = false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Arrow keys in the composer move the caret, not the page.
      const el = e.target as HTMLElement | null;
      if (el?.tagName === "TEXTAREA" || el?.tagName === "INPUT") return;
      if (SCROLL_KEYS.includes(e.key)) release();
    };

    window.addEventListener("wheel", release, { passive: true });
    window.addEventListener("touchmove", release, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("wheel", release);
      window.removeEventListener("touchmove", release);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const lastUserIndex = view.reduce(
    (last, m, i) => (m.role === "user" ? i : last),
    -1,
  );

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
                // The wrapper exists to carry the scroll anchor: MessageBubble
                // renders its own root and is not a forwardRef.
                <div key={m.id} ref={i === lastUserIndex ? anchor : undefined}>
                  <MessageBubble
                    message={m}
                    streaming={
                      busy && i === view.length - 1 && m.role === "assistant"
                    }
                    onSuggestion={send}
                  />
                </div>
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

      {/* The English mirror. Only the empty state carries both languages:
          nobody has said which one they speak yet, and the assistant answers
          in whichever the first question arrives in. Once it does, the thread
          settles into that language and this is gone.

          Kept quieter than the Persian above rather than side by side —
          Persian is the primary audience, and two headings at equal weight
          would read as a language picker the user is expected to act on.
          Not an <h2>: one heading per empty state, and this repeats it. */}
      <div dir="ltr" lang="en" className="mx-auto mt-7 max-w-md">
        <p className="text-lg font-semibold text-ink-2">
          What are you deploying on Liara?
        </p>
        <p className="mt-2 text-sm leading-6 text-ink-3">
          Generate a config, get the CLI commands, or paste a deployment error
          log and we&rsquo;ll trace it to its root cause — all grounded in
          Liara&rsquo;s official docs.
        </p>
      </div>

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
