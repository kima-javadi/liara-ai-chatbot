import type { ReactNode } from "react";

/**
 * Isolates Latin runs inside Persian (RTL) text.
 *
 * Without isolation the bidi algorithm reorders punctuation that sits at the
 * edge of a Latin run, because that punctuation is directionally neutral and
 * takes the direction of its surroundings. `.liaraignore` renders as
 * `liaraignore.` and `--build-location` loses its leading dashes to the wrong
 * side of the word.
 *
 * The match deliberately requires the run to *end* on an alphanumeric. A
 * trailing dot is far more often the Persian sentence's full stop than part
 * of an identifier, and swallowing it would drag the sentence terminator to
 * the wrong end of the line — trading one bug for a worse one.
 */
const LATIN_RUN =
  /[.\-@/_#~]*[A-Za-z][A-Za-z0-9]*(?:[._\-@/:+#]+[A-Za-z0-9]+)*/g;

export function bidi(text: string, keyPrefix = "b"): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  LATIN_RUN.lastIndex = 0;

  while ((m = LATIN_RUN.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <span key={`${keyPrefix}-${key++}`} dir="ltr" className="bidi-isolate">
        {m[0]}
      </span>,
    );
    last = LATIN_RUN.lastIndex;
  }

  if (last < text.length) out.push(text.slice(last));
  return out;
}
