"use client";

import { useEffect, useRef } from "react";
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

/**
 * How far from the bottom still counts as "at the bottom", in px. Used only
 * to decide whether a downward gesture has brought the reader back to the
 * live end of the transcript, which re-arms the follow.
 */
const STICK_SLACK = 80;

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

  // Autoscroll: stick to the bottom of the page, and re-arm on every new
  // question.
  //
  // A one-shot scroll when the question lands is not enough. Measured in the
  // real app: sending a second question scrolled to 327px, which WAS the
  // bottom at that instant — but the answer then streamed in and the page
  // grew to 1058px, so the reply the user was waiting for arrived below the
  // fold anyway. Following the growth is the only version of this that keeps
  // the newest content on screen.
  //
  // `stick` is what keeps that from hijacking the page. The scroll listener
  // re-derives it from distance-to-bottom, so scrolling up to re-read
  // something stops the follow, and scrolling back down resumes it. That
  // works because the programmatic scroll below lands within the threshold
  // of the bottom and so keeps the flag true.
  //
  // Instant, not smooth, on purpose: a smooth scroll emits scroll events at
  // intermediate positions, and the listener would read one of those as "the
  // user scrolled up" and unstick mid-animation. It also sidesteps the
  // reduced-motion question entirely.
  //
  // The follow is driven by a ResizeObserver rather than by a render effect
  // keyed on the message text. Keying on text length tracked the stream
  // correctly but stopped 116px short at the end, every time: the last of the
  // page's growth — the chip row appearing once splitChips sees a complete
  // marker, and the streaming caret going away — arrives in a commit where
  // the text length has already settled, so the effect never re-ran. Watching
  // the layout instead catches every source of growth without having to
  // enumerate them. Scrolling does not resize the body, so this cannot loop.
  const stick = useRef(true);
  const userTurns = messages.reduce((n, m) => (m.role === "user" ? n + 1 : n), 0);

  useEffect(() => {
    stick.current = true;
  }, [userTurns]);

  useEffect(() => {
    const follow = () => {
      if (!stick.current) return;
      window.scrollTo({ top: document.documentElement.scrollHeight });
    };
    const observer = new ResizeObserver(follow);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);

  // Unstick on an explicit upward gesture, NOT on scroll position.
  //
  // Deriving it from distance-to-bottom inside a `scroll` handler looks
  // simpler and is what this did first, but a `scroll` event carries no hint
  // of who caused it, and the follow above is itself a scroll — so while the
  // page was also growing, the handler read its own work as a reader
  // scrolling away and gave up 593px short of the bottom (measured). A wheel,
  // a touch drag or a PageUp/Home keypress is unambiguously the human.
  useEffect(() => {
    const nearBottom = () =>
      document.documentElement.scrollHeight - window.scrollY - window.innerHeight <
      STICK_SLACK;

    const onWheel = (e: WheelEvent) => {
      // Scrolling back down to the bottom re-arms it, so the reader does not
      // have to send a new message to get the follow back.
      stick.current = e.deltaY < 0 ? false : nearBottom();
    };

    let touchY: number | null = null;
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY;
      if (touchY === null || y === undefined) return;
      // Dragging the content downward reveals what is above: scrolling up.
      stick.current = y > touchY ? false : nearBottom();
      touchY = y;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (["PageUp", "Home", "ArrowUp"].includes(e.key)) stick.current = false;
      if (["PageDown", "End", "ArrowDown"].includes(e.key)) stick.current = nearBottom();
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

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
