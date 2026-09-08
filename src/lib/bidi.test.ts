import { describe, expect, it } from "vitest";
import { detectDir } from "./bidi";

describe("detectDir", () => {
  it("reads Persian prose as RTL", () => {
    expect(detectDir("چطور اپ را دیپلوی کنم؟")).toBe("rtl");
  });

  it("reads English prose as LTR", () => {
    expect(detectDir("How do I deploy a Next.js app?")).toBe("ltr");
  });

  it("ignores leading neutrals — digits, markers and punctuation", () => {
    expect(detectDir("1. **دیپلوی اپ**: دستور زیر را اجرا کنید")).toBe("rtl");
    expect(detectDir("2. **Deploy**: run the command below")).toBe("ltr");
  });

  it("does not let code flip a Persian message to LTR", () => {
    expect(detectDir("`liara deploy` را اجرا کنید.")).toBe("rtl");
    expect(detectDir("```bash\nliara deploy\n```\n\nاپ دیپلوی شد.")).toBe("rtl");
  });

  it("falls back to the code when there is no prose", () => {
    expect(detectDir("```bash\nliara deploy\n```")).toBe("ltr");
  });

  it("takes the question's language when a Persian question precedes a log", () => {
    expect(detectDir("این خطا چیست؟\nError: ENOENT no such file")).toBe("rtl");
  });

  it("returns null for text with no strong direction", () => {
    expect(detectDir("۱۲۳ — 456 …")).toBeNull();
    expect(detectDir("")).toBeNull();
  });
});
