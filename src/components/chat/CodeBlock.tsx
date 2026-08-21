"use client";

import { useState } from "react";
import { highlight } from "@/lib/highlight";

type Props = {
  code: string;
  lang?: string;
  /** Shown as a tag in the header, e.g. `liara.json`, `Dockerfile`. */
  filename?: string;
};

export function CodeBlock({ code, lang, filename }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be unavailable over plain http or without focus.
      // Silently leave the button in its resting state rather than lying.
    }
  }

  function download() {
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || `snippet.${lang || "txt"}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const isJson = (lang || "").toLowerCase() === "json";

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-line bg-surface-2">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-white/[0.02] px-3 py-2">
        <div className="flex items-center gap-2" dir="ltr">
          {filename ? (
            <span className="rounded-md border border-line-2 bg-space-2 px-2 py-0.5 font-mono text-[11px] text-ink-2">
              {filename}
            </span>
          ) : null}
          {lang ? (
            <span className="font-mono text-[11px] uppercase tracking-wide text-ink-3">
              {lang}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          {isJson ? (
            <button
              onClick={download}
              className="rounded-md px-2 py-1 text-xs text-ink-2 transition-colors hover:bg-white/5 hover:text-ink"
            >
              دانلود
            </button>
          ) : null}
          <button
            onClick={copy}
            aria-live="polite"
            className={`rounded-md px-2 py-1 text-xs transition-colors ${
              copied
                ? "bg-brand/15 text-brand"
                : "text-ink-2 hover:bg-white/5 hover:text-ink"
            }`}
          >
            {copied ? "کپی شد!" : "کپی"}
          </button>
        </div>
      </div>

      <pre
        dir="ltr"
        className="overflow-x-auto px-4 py-3 text-left font-mono text-[13px] leading-relaxed"
      >
        <code>{highlight(code, lang)}</code>
      </pre>
    </div>
  );
}
