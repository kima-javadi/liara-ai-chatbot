import type { ReactNode } from "react";

export type Dir = "rtl" | "ltr";

/**
 * Strong-directional characters. Digits, punctuation and whitespace are
 * deliberately absent: they are neutral, and a line that opens with "1." or
 * "**" must take its direction from the first real word, not the marker.
 *
 * The gaps carved out of the Arabic block are the digits — Arabic-Indic
 * (U+0660–U+0669) and the Persian extended set (U+06F0–U+06F9) that Vazirmatn
 * renders for ۱۲۳. Unicode classes those as numeric, not strong, and a line
 * numbered in Persian digits should still take its direction from its words.
 */
const RTL_CHARS =
  "\\u0590-\\u05FF\\u0600-\\u065F\\u066D-\\u06EF\\u06FA-\\u06FF\\u0700-\\u077F\\u08A0-\\u08FF\\uFB1D-\\uFDFF\\uFE70-\\uFEFF";
const LTR_CHARS = "A-Za-z\\u00C0-\\u024F";

const FIRST_STRONG = new RegExp(`[${LTR_CHARS}${RTL_CHARS}]`);
const IS_RTL = new RegExp(`[${RTL_CHARS}]`);

/**
 * Resolves the base direction of a message from its first strong character —
 * the same rule as `dir="auto"`, with one correction.
 *
 * Code is stripped before looking. A Persian answer that opens with a
 * ```bash fence, or a sentence that starts with `liara deploy`, is still a
 * Persian answer; letting those Latin characters win would flip the whole
 * message to LTR. `dir="auto"` cannot make that distinction, which is why
 * this exists rather than deferring to the browser.
 *
 * Returns null when the text carries no direction of its own (digits and
 * punctuation only) — the caller should fall back to the page direction.
 */
export function detectDir(text: string): Dir | null {
  const prose = text
    .replace(/```[\s\S]*?(?:```|$)/g, " ")
    .replace(/`[^`]*`/g, " ");

  const m = FIRST_STRONG.exec(prose) ?? FIRST_STRONG.exec(text);
  if (!m) return null;
  return IS_RTL.test(m[0]) ? "rtl" : "ltr";
}

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

/**
 * @param baseDir direction of the block this text sits in. In an LTR block
 *   there is nothing to isolate — the Latin runs *are* the base direction, and
 *   wrapping every word in a span would only add DOM noise. Omit it to have
 *   the direction resolved from the text itself.
 */
export function bidi(
  text: string,
  keyPrefix = "b",
  baseDir?: Dir | null,
): ReactNode[] {
  const dir = baseDir ?? detectDir(text);
  if (dir === "ltr") return [text];

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
