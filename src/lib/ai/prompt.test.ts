import { describe, it, expect } from "vitest";
import { buildContext } from "./prompt";

describe("buildContext with no hits", () => {
  // The old string ordered a refusal, and the model obeyed it literally:
  // asked «زمان نگهداشت لاگ‌های برنامه در لیارا چقدر است؟» with an empty
  // context it replied exactly «این موضوع در مستندات لیارا پیدا نشد.»
  // (measured against the live provider). The guard is on that observed
  // output phrase, so the instruction can be reworded freely as long as it
  // stops telling the model to say the topic was not found.
  it("does not instruct the model to say the topic was not found", () => {
    expect(buildContext([])).not.toContain("پیدا نشد");
  });

  it("still tells the model something, rather than an empty context", () => {
    expect(buildContext([]).length).toBeGreaterThan(40);
  });
});
