import { describe, it, expect } from "vitest";
import { normalize, tokenize } from "./tokenize";

describe("normalize", () => {
  it("folds Arabic yeh and kaf to Persian forms", () => {
    expect(normalize("كيف")).toBe("کیف");
  });

  it("folds Arabic-Indic and Persian digits to ASCII", () => {
    expect(normalize("٣٠٠٠")).toBe("3000");
    expect(normalize("۳۰۰۰")).toBe("3000");
  });

  it("strips diacritics", () => {
    expect(normalize("مُستَندات")).toBe("مستندات");
  });

  it("turns the zero-width non-joiner into a space", () => {
    expect(normalize("می‌شود")).toBe("می شود");
  });

  it("lowercases Latin text", () => {
    expect(normalize("NextJS")).toBe("nextjs");
  });
});

describe("tokenize", () => {
  it("keeps technical tokens intact and also emits their parts", () => {
    const t = tokenize("liara.json");
    expect(t).toContain("liara.json");
    expect(t).toContain("liara");
    expect(t).toContain("json");
  });

  it("keeps flags intact without their leading dashes as a separate token", () => {
    const t = tokenize("--build-location");
    expect(t).toContain("build-location");
    expect(t).toContain("build");
    expect(t).toContain("location");
  });

  it("splits Persian prose on whitespace", () => {
    expect(tokenize("استقرار برنامه")).toEqual(["استقرار", "برنامه"]);
  });

  it("removes Persian stopwords", () => {
    expect(tokenize("این یک برنامه است")).toEqual(["برنامه"]);
  });

  it("keeps digits as tokens", () => {
    expect(tokenize("port 3000")).toEqual(["port", "3000"]);
  });

  it("returns an empty array for empty input", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("does not emit duplicate parts when the whole equals the part", () => {
    expect(tokenize("liara")).toEqual(["liara"]);
  });

  it("exempts technical token parts from stopword filtering", () => {
    expect(tokenize("--with-cache")).toEqual([
      "with-cache",
      "with",
      "cache",
      "withcache",
    ]);
    expect(tokenize("--for-env")).toEqual([
      "for-env",
      "for",
      "env",
      "forenv",
    ]);
  });

  it("also emits a technical token's parts concatenated, so either spelling style matches", () => {
    expect(tokenize("Next.js")).toEqual(["next.js", "next", "js", "nextjs"]);
    expect(tokenize("liara.json")).toEqual([
      "liara.json",
      "liara",
      "json",
      "liarajson",
    ]);
  });

  it("lets a query typed as one word meet a document typed with a separator", () => {
    // The corpus almost always spells the framework as one word ("NextJS");
    // a natural-language query often types it with a dot ("Next.js"). Both
    // must tokenize to a shared term or the two can never match.
    expect(tokenize("Next.js")).toContain("nextjs");
    expect(tokenize("NextJS")).toContain("nextjs");
  });

  it("does not duplicate the concatenation when it equals a part or the whole", () => {
    // "3000:3000" -> parts ["3000","3000"], joined "30003000": harmless noise,
    // still emitted once. A token with only one distinct part after removing
    // separators, e.g. a whole that already has no separator, never reaches
    // this path since TECHNICAL requires at least one separator.
    expect(tokenize("3000:3000")).toEqual(["3000:3000", "3000", "3000", "30003000"]);
  });

  it("removes English stopwords in the generic word pass", () => {
    expect(tokenize("this is a test")).not.toContain("is");
    expect(tokenize("this is a test")).toContain("test");
  });

  it("never emits a token containing Arabic/Persian punctuation", () => {
    // U+0600-U+061F is the Arabic punctuation and sign block (؟ ، ؛ …), not
    // letters — a trailing "؟" must not glue onto the preceding word.
    const PUNCTUATION = /[؀-؟]/;
    const samples = [
      "چطور یک برنامه Next.js را روی لیارا مستقر کنم؟",
      "چگونه دامنه اختصاصی به برنامه‌ام اضافه کنم؟",
      "خطای ۵۰۲ می‌گیرم، چه کار کنم؟",
      "این یک تست است؛ آیا کار می‌کند؟",
    ];
    for (const s of samples) {
      for (const t of tokenize(s)) {
        expect(t).not.toMatch(PUNCTUATION);
      }
    }
  });
});
