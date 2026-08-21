"use client";

import type { ReactNode } from "react";
import { CodeBlock } from "./CodeBlock";
import { SourceBadges } from "./SourceBadges";
import { Chip } from "./Chip";
import type { Message } from "@/lib/mock";

type Props = {
  message: Message;
  streaming?: boolean;
  onSuggestion?: (prompt: string) => void;
};

export function MessageBubble({ message, streaming, onSuggestion }: Props) {
  if (message.role === "user") {
    return (
      <div className="animate-rise flex justify-start">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm border border-line-2 bg-surface px-4 py-3 text-[15px] leading-7 text-ink">
          <div className="whitespace-pre-wrap">{message.content}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-rise flex gap-3">
      <Avatar />
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="text-[15px] leading-8 text-ink">
          {renderContent(message.content, streaming)}
        </div>

        {message.sources?.length ? (
          <SourceBadges sources={message.sources} />
        ) : null}

        {message.suggestions?.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.suggestions.map((s) => (
              <Chip
                key={s}
                variant="suggestion"
                onClick={() => onSuggestion?.(s)}
              >
                {s}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Avatar() {
  return (
    <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border border-brand/25 bg-brand/10">
      <svg width="14" height="14" viewBox="0 0 32 32" fill="none">
        <path d="M16 6.5 25 11.5 16 16.5 7 11.5 16 6.5Z" fill="#00e5b7" />
        <path d="M16 14 25 19 16 24 7 19 16 14Z" fill="#38bdf8" opacity="0.6" />
      </svg>
    </div>
  );
}

/**
 * Splits a message into prose and fenced code blocks.
 *
 * The fence may carry a filename after the language: ```json:liara.json
 */
function renderContent(content: string, streaming?: boolean): ReactNode {
  const parts: ReactNode[] = [];
  const fence = /```([a-zA-Z0-9]+)?(?::([^\n]+))?\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  while ((m = fence.exec(content))) {
    if (m.index > last) {
      parts.push(
        <Prose key={key++} text={content.slice(last, m.index)} />,
      );
    }
    parts.push(
      <CodeBlock
        key={key++}
        lang={m[1]}
        filename={m[2]?.trim()}
        code={m[3].replace(/\n$/, "")}
      />,
    );
    last = fence.lastIndex;
  }

  if (last < content.length) {
    parts.push(
      <Prose key={key++} text={content.slice(last)} streaming={streaming} />,
    );
  }

  return parts;
}

/** Paragraphs with **bold** and `inline code`. */
function Prose({ text, streaming }: { text: string; streaming?: boolean }) {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());

  return (
    <>
      {paragraphs.map((p, i) => (
        <p
          key={i}
          className={
            i === paragraphs.length - 1 && streaming ? "caret" : undefined
          }
        >
          {inline(p.trim())}
        </p>
      ))}
    </>
  );
}

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) {
      out.push(
        <strong key={key++} className="font-semibold text-ink">
          {m[1]}
        </strong>,
      );
    } else {
      out.push(
        <code
          key={key++}
          className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[12.5px] text-brand-2"
        >
          {m[2]}
        </code>,
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
