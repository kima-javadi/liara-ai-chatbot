import { describe, it, expect } from "vitest";
import { splitChips } from "./chips";

describe("splitChips", () => {
  it("extracts chips and strips the marker from the body", () => {
    const r = splitChips("پاسخ اینجاست.\n<<<NEXT: اول | دوم | سوم >>>");
    expect(r.body).toBe("پاسخ اینجاست.");
    expect(r.chips).toEqual(["اول", "دوم", "سوم"]);
  });

  it("handles two suggestions", () => {
    expect(splitChips("متن\n<<<NEXT: یک | دو >>>").chips).toEqual(["یک", "دو"]);
  });

  it("returns no chips when the marker is absent", () => {
    const r = splitChips("فقط یک پاسخ ساده");
    expect(r.body).toBe("فقط یک پاسخ ساده");
    expect(r.chips).toEqual([]);
  });

  it("hides a partially streamed marker from the body", () => {
    // Mid-stream the marker arrives a character at a time and must never be
    // rendered as prose.
    expect(splitChips("پاسخ\n<<<NEXT: اول |").body).toBe("پاسخ");
    expect(splitChips("پاسخ\n<<<N").body).toBe("پاسخ");
    expect(splitChips("پاسخ\n<<<").body).toBe("پاسخ");
  });

  it("returns no chips for a partial marker", () => {
    expect(splitChips("پاسخ\n<<<NEXT: اول |").chips).toEqual([]);
  });

  it("ignores empty suggestions", () => {
    expect(splitChips("م\n<<<NEXT: یک |  | سه >>>").chips).toEqual(["یک", "سه"]);
  });

  it("caps at three suggestions", () => {
    expect(splitChips("م\n<<<NEXT: ۱ | ۲ | ۳ | ۴ | ۵ >>>").chips).toHaveLength(3);
  });

  it("leaves a code block containing angle brackets alone", () => {
    const t = "```js\nif (a <<< b) {}\n```";
    expect(splitChips(t).body).toBe(t);
  });
});

/**
 * The defect these guard: PARTIAL's tail was `[^>]*`, so it stopped matching
 * the moment the first `>` of the closing marker arrived while COMPLETE still
 * needed all three — two frames of raw `<<<NEXT: … >` rendered at the end of
 * every answer, and many more if a chip's own text contained a `>`.
 *
 * The assertion is on what a reader would actually see, not on the regex: at
 * every single character of the stream, the visible body must be a prefix of
 * the finished body. Anything that leaks marker text breaks that immediately.
 */
describe("splitChips over a character-by-character stream", () => {
  const STREAMS = [
    "پورت را در liara.json تنظیم کن.\n\n<<<NEXT: قدم اول | قدم دوم | قدم سوم >>>",
    // A chip whose own text contains the character the old guard broke on.
    "متن.\n\n<<<NEXT: چطور a > b را تنظیم کنم؟ | قدم دوم >>>",
    // Trailing newline after the marker, as the model often emits.
    "Done.\n\n<<<NEXT: deploy it | add a disk | set env vars >>>\n",
  ];

  for (const stream of STREAMS) {
    it(`never shows marker text: ${stream.slice(0, 24)}…`, () => {
      const finalBody = splitChips(stream).body;
      const leaks: string[] = [];
      for (let i = 1; i <= stream.length; i++) {
        // trimEnd: trailing whitespace is invisible to the reader, and the
        // finished body is itself trimmed.
        const body = splitChips(stream.slice(0, i)).body.trimEnd();
        if (!finalBody.startsWith(body)) leaks.push(JSON.stringify(body));
      }
      expect(leaks, `frames showing text not in the final body`).toEqual([]);
    });
  }

  it("yields the finished chips once the stream completes", () => {
    expect(splitChips(STREAMS[0]).chips).toEqual(["قدم اول", "قدم دوم", "قدم سوم"]);
    expect(splitChips(STREAMS[1]).chips).toEqual(["چطور a > b را تنظیم کنم؟", "قدم دوم"]);
  });
});
