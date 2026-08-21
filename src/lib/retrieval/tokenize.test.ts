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
});
