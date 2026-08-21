import type { Source } from "@/lib/mock";
import { bidi } from "@/lib/bidi";

export function SourceBadges({ sources }: { sources: Source[] }) {
  if (!sources.length) return null;

  return (
    <div className="mt-4 border-t border-line/60 pt-3">
      <p className="mb-2 text-[11px] text-ink-3">منابع از مستندات رسمی لیارا</p>
      <div className="flex flex-wrap gap-2">
        {sources.map((s) => (
          <a
            key={s.url}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line bg-surface-2/70 px-2.5 py-1.5 text-xs text-ink-2 transition-colors hover:border-brand/40 hover:bg-brand/[0.06] hover:text-ink"
          >
            <span className="truncate">{bidi(s.title, s.url)}</span>
            <ExternalLink />
          </a>
        ))}
      </div>
    </div>
  );
}

function ExternalLink() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 16 16"
      fill="none"
      className="shrink-0 text-ink-3 transition-colors group-hover:text-brand"
      aria-hidden="true"
    >
      <path
        d="M6 3h7v7M13 3 6.5 9.5M11 10.5V13H3V5h2.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
