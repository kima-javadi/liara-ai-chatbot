"use client";

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  onClick?: () => void;
  /** Suggestion chips sit under an answer and read a touch quieter. */
  variant?: "action" | "suggestion";
};

export function Chip({ children, onClick, variant = "action" }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm",
        "transition-colors",
        variant === "action"
          ? "border-line-2 bg-surface/60 text-ink-2 hover:bg-line/60 hover:text-ink"
          : "border-electric/25 bg-electric/[0.07] text-electric hover:bg-electric/15",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
