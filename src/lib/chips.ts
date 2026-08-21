/**
 * Splits the trailing follow-up marker out of an assistant message.
 *
 * The marker streams in character by character, so a partial marker has to be
 * hidden from the body as it arrives — otherwise the reader watches `<<<NEXT:`
 * type itself out at the end of every answer.
 *
 * A malformed or missing marker yields no chips and an unmodified body. That
 * is the accepted failure mode: the answer is never damaged by chip parsing.
 */

const COMPLETE = /\n?<<<NEXT:([\s\S]*?)>>>\s*$/;
/** A prefix of the opening marker at the very end of the text. */
const PARTIAL = /\n?<{1,3}(?:N(?:E(?:X(?:T(?::[^>]*)?)?)?)?)?$/;

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
