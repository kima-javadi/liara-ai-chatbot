"use client";

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
