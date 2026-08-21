"use client";

import { useEffect, useRef, useState } from "react";
import { Header } from "@/components/chat/Header";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { Composer } from "@/components/chat/Composer";
import { Chip } from "@/components/chat/Chip";
import { CONVERSATION, QUICK_ACTIONS, type Message } from "@/lib/mock";

/**
 * Design prototype.
 *
 * Streaming is simulated from canned answers so the interface can be judged
 * before the retrieval backend exists. Swapping `replay()` for `useChat()`
 * against `/api/chat` is the only change these components need.
 */
export default function Page() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const turn = useRef(0);
  const seq = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Instant during streaming: smooth scrolling gets cancelled by the next
    // token update and never reaches the bottom.
    bottom.current?.scrollIntoView({
      behavior: streaming ? "auto" : "smooth",
      block: "end",
    });
  }, [messages, streaming]);

  function send(text: string) {
    const userMsg: Message = {
      id: `u-${(seq.current += 1)}`,
      role: "user",
      content: text,
    };
    setMessages((m) => [...m, userMsg]);

    const answers = CONVERSATION.filter((m) => m.role === "assistant");

    // Log-shaped input gets the diagnosis answer; everything else gets the
    // config answer. Crude on purpose — the real route retrieves instead.
    const looksLikeLog = /خطا|error|ERR!|failed|exit code/i.test(text);
    const answer = looksLikeLog
      ? answers[1]
      : answers[turn.current % answers.length];
    turn.current += 1;

    replay(answer);
  }

  function replay(answer: Message) {
    setStreaming(true);
    const id = `a-${(seq.current += 1)}`;
    setMessages((m) => [...m, { id, role: "assistant", content: "" }]);

    const full = answer.content;
    let i = 0;

    const tick = setInterval(() => {
      // Chunky steps read more like real token streaming than per-character.
      i = Math.min(i + 3 + Math.floor(i % 5), full.length);
      const slice = full.slice(0, i);

      setMessages((m) =>
        m.map((msg) => (msg.id === id ? { ...msg, content: slice } : msg)),
      );

      if (i >= full.length) {
        clearInterval(tick);
        setMessages((m) =>
          m.map((msg) =>
            msg.id === id
              ? {
                  ...msg,
                  sources: answer.sources,
                  suggestions: answer.suggestions,
                }
              : msg,
          ),
        );
        setStreaming(false);
      }
    }, 16);
  }

  const empty = messages.length === 0;

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />

      <main className="flex-1">
        {/* Extra bottom padding keeps citations and chips clear of the
            sticky composer. */}
        <div className="mx-auto max-w-3xl px-4 pt-6 pb-32">
          {empty ? (
            <EmptyState onPick={send} />
          ) : (
            <div className="space-y-7">
              {messages.map((m, i) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  streaming={
                    streaming &&
                    i === messages.length - 1 &&
                    m.role === "assistant"
                  }
                  onSuggestion={send}
                />
              ))}
            </div>
          )}
          <div ref={bottom} className="h-2" />
        </div>
      </main>

      <Composer onSend={send} disabled={streaming} />
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="pt-16 pb-8 text-center">
      <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl border border-brand/20 bg-brand/[0.07]">
        <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
          <path d="M16 6.5 25 11.5 16 16.5 7 11.5 16 6.5Z" fill="#00e5b7" />
          <path
            d="M16 14 25 19 16 24 7 19 16 14Z"
            fill="#38bdf8"
            opacity="0.6"
          />
        </svg>
      </div>

      <h2 className="text-2xl font-bold text-ink">
        روی لیارا چه چیزی مستقر می‌کنید؟
      </h2>
      <p className="mx-auto mt-3 max-w-md text-[15px] leading-7 text-ink-2">
        پیکربندی بسازید، دستورات <span className="bidi-isolate">CLI</span> را
        بگیرید، یا لاگ خطای استقرار را بچسبانید تا ریشه مشکل را پیدا کنیم — همه
        بر پایه مستندات رسمی لیارا.
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
