"use client";

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  onClick?: () => void;
  icon?: ReactNode;
  /** Suggestion chips sit under an answer and read a touch quieter. */
  variant?: "action" | "suggestion";
  disabled?: boolean;
};

export function Chip({
  children,
  onClick,
  icon,
  variant = "action",
  disabled,
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm",
        "transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        variant === "action"
          ? "border-line-2 bg-surface/60 text-ink-2 hover:bg-line/60 hover:text-ink"
          : "border-electric/25 bg-electric/[0.07] text-electric hover:bg-electric/15",
      ].join(" ")}
    >
      {icon ? <span className="shrink-0 opacity-80">{icon}</span> : null}
      {children}
    </button>
  );
}
