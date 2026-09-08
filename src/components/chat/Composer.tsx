"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onSend: (text: string) => void;
  disabled?: boolean;
};

export function Composer({ onSend, disabled }: Props) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with content up to a ceiling — pasted error logs are the main
  // reason this box needs to be more than one line.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [value]);

  function submit() {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
  }

  return (
    <div className="sticky bottom-0 border-t border-line/70 bg-space/80 pb-4 pt-3 backdrop-blur-xl">
      <div className="mx-auto max-w-3xl px-4">
        <div className="flex items-end gap-2 rounded-2xl border border-line-2 bg-surface/70 p-2 transition-colors focus-within:border-brand/40">
          <textarea
            ref={ref}
            rows={1}
            dir="auto"
            value={value}
            disabled={disabled}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="سوال خود را بپرسید یا لاگ خطا را اینجا بچسبانید…"
            className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] leading-7 text-ink outline-none placeholder:text-ink-3 disabled:opacity-50"
          />
          <button
            onClick={submit}
            disabled={disabled || !value.trim()}
            aria-label="ارسال"
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand text-space transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M14 8H2m0 0 4.5-4.5M2 8l4.5 4.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <p className="mt-2 text-center text-[11px] text-ink-3">
          پاسخ‌ها بر پایه مستندات رسمی لیارا تولید می‌شوند. کلیدها و رمزها پیش
          از ارسال به مدل حذف می‌شوند.
        </p>
      </div>
    </div>
  );
}
