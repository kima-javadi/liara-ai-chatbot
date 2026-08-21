export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-space/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <LiaraMark />
          <div className="leading-tight">
            <h1 className="text-sm font-semibold text-ink">Liara Copilot</h1>
            <p className="text-[11px] text-ink-3">دستیار استقرار و مستندات</p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-line bg-surface/60 px-3 py-1.5">
          <span className="size-1.5 rounded-full bg-brand animate-pulse-dot" />
          <span className="text-[11px] text-ink-2">
            متصل به <span className="bidi-isolate">Liara AI</span>
          </span>
        </div>
      </div>
    </header>
  );
}

/** Liara's geometric mark: stacked isometric planes. */
function LiaraMark() {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 32 32"
      fill="none"
      aria-label="Liara"
      className="shrink-0"
    >
      <rect width="32" height="32" rx="9" fill="#0f172a" />
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="31"
        rx="8.5"
        stroke="#1e293b"
      />
      <path d="M16 6.5 25 11.5 16 16.5 7 11.5 16 6.5Z" fill="#00e5b7" />
      <path d="M16 14 25 19 16 24 7 19 16 14Z" fill="#38bdf8" opacity="0.55" />
      <path
        d="M16 19.5 25 24.5"
        stroke="#00e5b7"
        strokeOpacity="0.35"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
