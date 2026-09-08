"use client";

import type { ReactNode } from "react";
import { CodeBlock } from "./CodeBlock";
import { SourceBadges } from "./SourceBadges";
import { Chip } from "./Chip";
import { bidi, detectDir, type Dir } from "@/lib/bidi";

export type Source = { title: string; url: string };

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  suggestions?: string[];
};

type Props = {
  message: Message;
  streaming?: boolean;
  onSuggestion?: (prompt: string) => void;
};

export function MessageBubble({ message, streaming, onSuggestion }: Props) {
  if (message.role === "user") {
    // The bubble itself follows the question's language, so an English
    // question sits on the left with its tail on the left — the mirror of a
    // Persian one — instead of an LTR paragraph pinned to the RTL edge.
    const dir = detectDir(message.content);

    return (
      <div className="animate-rise flex justify-start" dir={dir ?? undefined}>
        {/* Logical corners: the clipped tail belongs on the side the message
            starts from, which flips with `dir`. */}
        <div className="max-w-[85%] rounded-2xl rounded-ss-sm border border-line-2 bg-surface px-4 py-3 text-[15px] leading-7 text-ink">
          {/* Per line, not per message: a pasted log is Latin while the
              question above it is Persian, and dir="auto" resolves each
              from its own first strong character. */}
          {message.content.split("\n").map((line, i) => (
            <div
              key={i}
              dir="auto"
              className={line.trim() ? "whitespace-pre-wrap" : "h-3"}
            >
              {/* dir="auto" fixes the line's base direction; bidi() still has
                  to isolate Latin runs within an RTL line — and skips the
                  work entirely on a line that is already LTR. */}
              {bidi(line, `l${i}`, detectDir(line))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Resolved once for the whole answer rather than per line. The model
  // replies in the language it was asked in (system prompt rule 3), so the
  // message is uniform — and a per-line rule would flip any Persian line that
  // happens to open with a command name.
  const dir = detectDir(message.content);

  return (
    <div className="animate-rise flex gap-3" dir={dir ?? undefined}>
      <Avatar />
      <div className="min-w-0 flex-1 pt-0.5">
        {/* Paragraph spacing lives here rather than on the <p> in Prose,
            because renderContent emits paragraphs and code blocks as siblings
            of this div (the fragments Prose returns create no DOM node). The
            `p + p` pair is deliberate: it separates consecutive paragraphs —
            which Tailwind's preflight leaves at margin 0, so a wrapped list
            item was indistinguishable from the next item — while leaving the
            space around a code block to CodeBlock's own `my-3`, and adding no
            stray gap above the first paragraph or below the last. */}
        <div className="text-[15px] leading-8 text-ink [&>p+p]:mt-4">
          {renderContent(message.content, dir, streaming)}
        </div>

        {message.sources?.length ? (
          <SourceBadges sources={message.sources} />
        ) : null}

        {message.suggestions?.length ? (
          // Labelled like SourceBadges, and for the same reason: a bare row
          // of chips reads as decoration. No separator rule though — sources
          // draw one directly above, and two in a row is a lot of furniture.
          //
          // Wording stays neutral because these chips carry two different
          // things: the follow-up steps of a normal answer, and the answer
          // options of a clarifying question (system prompt rule 9).
          <div className="mt-4">
            <p className="mb-2 text-[11px] text-ink-3">پیشنهاد برای ادامه</p>
            <div className="flex flex-wrap gap-2">
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
function renderContent(
  content: string,
  dir: Dir | null,
  streaming?: boolean,
): ReactNode {
  const parts: ReactNode[] = [];
  const fence = /```([a-zA-Z0-9]+)?(?::([^\n]+))?\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  while ((m = fence.exec(content))) {
    if (m.index > last) {
      parts.push(
        <Prose key={key++} text={content.slice(last, m.index)} dir={dir} />,
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
      <Prose
        key={key++}
        text={content.slice(last)}
        dir={dir}
        streaming={streaming}
      />,
    );
  }

  return parts;
}

/** Paragraphs with **bold** and `inline code`. */
function Prose({
  text,
  dir,
  streaming,
}: {
  text: string;
  dir: Dir | null;
  streaming?: boolean;
}) {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());

  return (
    <>
      {paragraphs.map((p, i) => (
        // whitespace-pre-line keeps single newlines as line breaks.
        //
        // Only blank lines start a new paragraph here, and HTML collapses a
        // lone newline into a space — so when the model wrote a bulleted list
        // one-per-line (which it does about half the time; the same question
        // came back double-spaced on one run and single-spaced on the next),
        // all eight bullets rendered as one run-on line. `pre-line` honours
        // those newlines while still collapsing the runs of spaces and the
        // indentation that markdown lists arrive with.
        <p
          key={i}
          className={[
            "whitespace-pre-line",
            i === paragraphs.length - 1 && streaming ? "caret" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {inline(p.trim(), dir)}
        </p>
      ))}
    </>
  );
}

function inline(text: string, dir: Dir | null): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  while ((m = re.exec(text))) {
    if (m.index > last)
      out.push(...bidi(text.slice(last, m.index), `i${key++}`, dir));
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
  if (last < text.length)
    out.push(...bidi(text.slice(last), `i${key++}`, dir));
  return out;
}
