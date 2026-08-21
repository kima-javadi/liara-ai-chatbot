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
