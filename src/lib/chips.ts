import { CHIP_MARKER_OPEN, CHIP_MARKER_CLOSE } from "@/lib/ai/prompt";

/**
 * Splits the trailing follow-up marker out of an assistant message.
 *
 * The marker streams in character by character, so a partial marker has to be
 * hidden from the body as it arrives — otherwise the reader watches `<<<NEXT:`
 * type itself out at the end of every answer.
 *
 * A malformed or missing marker yields no chips and an unmodified body. That
 * is the accepted failure mode: the answer is never damaged by chip parsing.
 *
 * Both patterns are derived from CHIP_MARKER_OPEN / CHIP_MARKER_CLOSE rather
 * than re-spelling them. They used to be hardcoded here, which meant changing
 * the constant would silently stop the parser matching and dump the raw marker
 * into every answer.
 */

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const OPEN = escape(CHIP_MARKER_OPEN);
const CLOSE = escape(CHIP_MARKER_CLOSE);

const COMPLETE = new RegExp(`\\n?${OPEN}([\\s\\S]*?)${CLOSE}\\s*$`);

/**
 * The marker mid-arrival at the very end of the text: either a prefix of the
 * opening marker, or the whole opening marker followed by however much of the
 * chip line has arrived so far.
 *
 * That second branch is deliberately `[\s\S]*` and not the `[^>]*` it used to
 * be. `[^>]*` stopped matching the instant the first `>` of the closing marker
 * arrived, while COMPLETE needs all three — so the raw
 * `<<<NEXT: … >` and `<<<NEXT: … >>` frames rendered visibly at the end of
 * every single answer, and a chip whose own text contained a `>` leaked from
 * that character onward. The marker is specified as the last line of the
 * response, so once the opening marker has arrived everything after it is
 * marker content and belongs hidden.
 */
const OPEN_PREFIXES = Array.from(
  { length: CHIP_MARKER_OPEN.length },
  (_, i) => CHIP_MARKER_OPEN.slice(0, i + 1),
)
  .reverse()
  .map(escape)
  .join("|");

const PARTIAL = new RegExp(`\\n?(?:${OPEN}[\\s\\S]*|${OPEN_PREFIXES})$`);

export function splitChips(text: string): { body: string; chips: string[] } {
  const complete = text.match(COMPLETE);
  if (complete) {
    const chips = complete[1]
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);
    return { body: text.slice(0, complete.index).trimEnd(), chips };
  }

  const partial = text.match(PARTIAL);
  if (partial) {
    return { body: text.slice(0, partial.index).trimEnd(), chips: [] };
  }

  return { body: text, chips: [] };
}
