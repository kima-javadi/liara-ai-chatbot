import { STOPWORDS } from "./stopwords";

/**
 * Normalization and tokenization for a mixed Persian/technical corpus.
 *
 * Persian text arrives with inconsistent orthography — Arabic yeh and kaf mixed
 * with Persian forms, three different digit sets, optional diacritics — and
 * BM25 treats each variant as a different term. Without normalization a query
 * typed with an Arabic keyboard cannot match a document typed with a Persian
 * one, which is a total retrieval failure rather than a quality issue.
 */

const ARABIC_YEH = /[يى]/g; // ي, ى -> ی
const ARABIC_KAF = /[ك]/g; // ك -> ک
const DIACRITICS = /[ً-ٰٟۖ-ۭ]/g;
const ZWNJ = /[‌‏‎]/g;
const ARABIC_INDIC = /[٠-٩]/g;
const PERSIAN_DIGITS = /[۰-۹]/g;

export function normalize(text: string): string {
  return text
    .replace(ARABIC_YEH, "ی")
    .replace(ARABIC_KAF, "ک")
    .replace(DIACRITICS, "")
    .replace(ZWNJ, " ")
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(PERSIAN_DIGITS, (d) => String(d.charCodeAt(0) - 0x06f0))
    .toLowerCase();
}

/**
 * A technical token: Latin/digits joined by internal `.`, `-`, `_`, `/`, `:`.
 * Leading dashes are excluded from the capture so `--build-location` yields
 * `build-location` rather than a token no query would ever reproduce.
 */
const TECHNICAL = /[a-z0-9]+(?:[._\-/:][a-z0-9]+)+/g;
const WORD = /[a-z0-9]+|[؀-ۿ]+/g;

export function tokenize(text: string): string[] {
  const normalized = normalize(text);
  const out: string[] = [];

  const push = (t: string) => {
    if (!t || STOPWORDS.has(t)) return;
    out.push(t);
  };

  // Technical tokens first: capture the whole, then its parts, then blank the
  // match so the generic word pass does not re-emit the parts a second time.
  let remainder = normalized;
  const technical = normalized.match(TECHNICAL) ?? [];
  for (const whole of technical) {
    push(whole);
    const parts = whole.split(/[._\-/:]/).filter(Boolean);
    for (const p of parts) out.push(p);
    remainder = remainder.replace(whole, " ");
  }

  for (const w of remainder.match(WORD) ?? []) push(w);

  return out;
}
