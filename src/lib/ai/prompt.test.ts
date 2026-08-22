import { describe, it, expect } from "vitest";
import { buildContext, retrievalQuery, SYSTEM_PROMPT } from "./prompt";
import type { SearchHit } from "@/lib/retrieval";

function hit(score: number, text = "متن سند"): SearchHit {
  return {
    score,
    chunk: {
      id: "https://docs.liara.ir/x#0-0",
      url: "https://docs.liara.ir/x",
      pageTitle: "عنوان",
      sectionTitle: null,
      platform: null,
      text,
      code: [],
    },
  };
}

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

/**
 * The zero-hit branch above was hardened against exactly one refusal; the
 * WEAK-hit branch never existed, and that is what produced the reported
 * defect. Asked «لیارا چه خدماتی داره؟» the model answered «سوال شما مرتبط با
 * خدمات خاص لیارا نیست و من نمی‌توانم به آن پاسخ دهم.»
 *
 * Retrieval had not returned nothing — it returned six chunks at top-1 score
 * 1.74 (delete-domain CLI, team roles, the console page), because the query's
 * only indexed token was «لیارا» (df 1749/4050); «خدماتی» and «داره» have
 * df 0. buildContext then labelled that noise «مستندات مرتبط» — relevant
 * documentation — so the model saw a broad question, six unrelated documents
 * presented as authoritative, and took the one exit the prompt offered.
 *
 * Measured over the real index, top-1 for sixteen questions that retrieve
 * correctly runs 6.54 - 74.68; the two collapsed broad phrasings both score
 * 1.74. The floor sits between.
 */
describe("buildContext with weak hits", () => {
  it("does not present a noise-scored result set as relevant documentation", () => {
    expect(buildContext([hit(1.74)])).not.toContain("مستندات مرتبط:");
  });

  it("tells the model to answer anyway rather than refuse", () => {
    const ctx = buildContext([hit(1.74)]);
    expect(ctx).toContain("دانش");
    expect(ctx).not.toContain("پیدا نشد");
  });

  it("still passes the retrieved text through, in case it is useful", () => {
    expect(buildContext([hit(1.74, "متن یک سند ضعیف")])).toContain("متن یک سند ضعیف");
  });

  it("presents a normally-scored result set as relevant documentation", () => {
    expect(buildContext([hit(8.37)])).toContain("مستندات مرتبط:");
  });
});

/**
 * The prompt's refusal clause is the other half of the same defect: it let a
 * broad question about Liara itself be classified as off-domain. The service
 * list is stated in the prompt so that even a query whose retrieval collapses
 * has the answer available.
 */
describe("SYSTEM_PROMPT", () => {
  it("names Liara's service lines, so a broad question can be answered", () => {
    for (const service of ["PaaS", "DBaaS", "IaaS", "Object Storage"]) {
      expect(SYSTEM_PROMPT).toContain(service);
    }
  });

  it("treats a broad question about Liara as in scope", () => {
    expect(SYSTEM_PROMPT).toContain("لیارا چه خدماتی");
  });
});

/**
 * The clarification rule sits in direct tension with rule 7 ("always emit a
 * complete, usable liara.json — never a fragment, never a refusal") and with
 * rule 1's anti-over-refusal wording, which exists because this prompt has
 * already produced two live refusal defects. A rule that says "ask instead of
 * answering" is one bad paraphrase away from being a third, so the guards are
 * asserted as explicitly as the rule itself: stated precedence over rule 7,
 * one question turn only, and a stated fallback when the user declines to
 * specify.
 */
describe("clarification rule", () => {
  it("states the rule with both worked examples", () => {
    expect(SYSTEM_PROMPT).toContain("اول ابهام را رفع کن");
    expect(SYSTEM_PROMPT).toContain("بدون نام فریم‌ورک");
    expect(SYSTEM_PROMPT).toContain("بدون نوع دیتابیس");
  });

  it("resolves its precedence against rule 7 rather than leaving it implicit", () => {
    expect(SYSTEM_PROMPT).toContain("بر قاعده ۷ مقدم است");
  });

  it("cannot become a refusal or an unbounded question loop", () => {
    expect(SYSTEM_PROMPT).toContain("بهانه امتناع");
    expect(SYSTEM_PROMPT).toContain("هرگز دو نوبت پشت‌هم سؤال نپرس");
    // The escape hatch when the user will not specify: answer with a default.
    expect(SYSTEM_PROMPT).toContain("فرقی نمی‌کند");
  });

  it("only fires when the answer actually depends on the missing parameter", () => {
    expect(SYSTEM_PROMPT).toContain("اگر جواب برای همه گزینه‌ها یکسان است");
  });

  // splitChips caps the marker at three entries and page.tsx sends a clicked
  // chip verbatim as the next user message, so the options are answerable in
  // one click — but only if the model is told to put them there.
  //
  // Both assertions below come from a live run of the rule's first draft.
  // Asked «یک liara.json برام بساز» the model asked for the platform, the app
  // name AND the port as three bullets and emitted NO chip line at all — the
  // clarification turn had nothing clickable and the mandatory-last-line
  // contract broke. Asked «چطور برنامه‌ام را دیپلوی کنم؟» it offered five
  // options, of which splitChips renders three: the bullets and the chips
  // disagreed.
  it("routes the options into the follow-up chip line", () => {
    expect(SYSTEM_PROMPT).toContain("قاعده ۹");
    expect(SYSTEM_PROMPT).toContain("این خط را هرگز حذف نکن");
  });

  it("bounds the options to what splitChips can render", () => {
    expect(SYSTEM_PROMPT).toContain("حداکثر ۳ گزینه");
  });

  it("asks only about the parameter that changes the answer", () => {
    // app/port are rule 7's business — they get sample values, not a question.
    expect(SYSTEM_PROMPT).toContain("نام برنامه و پورت را نپرس");
  });
});

/**
 * Overview intent: the same enrichment idiom as config-generation intent,
 * pointed at overview/about — the one page that actually lists the service
 * lines. Detection has to stay narrow: «نگاه» (df 20) is rare enough that the
 * enrichment dominates whatever else is in the query, so a false positive
 * replaces a real question rather than re-ranking it.
 */
describe("overview intent", () => {
  const BROAD = [
    "لیارا چه خدماتی داره؟",
    "خدمات لیارا چیه؟",
    "لیارا چیکار میکنه؟",
    "با لیارا چه کارهایی میشه کرد؟",
    "لیارا چه امکاناتی داره؟",
    "لیارا چیست؟",
    "what services does liara offer?",
  ];

  it("enriches a broad question about the platform", () => {
    for (const q of BROAD) {
      expect(retrievalQuery(q), q).not.toBe(q);
    }
  });

  // Every one of these names a specific service, a specific technology, or a
  // specific task. None is a question about Liara's catalogue.
  const SPECIFIC = [
    "liara.json چیست؟",
    "object storage چیست و چطور استفاده کنم؟",
    "خدمات دیتابیس لیارا چیست؟",
    "سرویس هوش مصنوعی لیارا چه مدل‌هایی دارد؟",
    "دیسک چیست؟",
    "چطور یک برنامه Flask را دیپلوی کنم؟",
    "cron job در لیارا",
    "قیمت سرور مجازی",
    "چطور دامنه اختصاصی اضافه کنم؟",
    "بکاپ دیتابیس MySQL",
    "لاگ‌های برنامه را چطور ببینم؟",
    "خطای 502 bad gateway در استقرار",
  ];

  it("leaves a question about a specific service or task unenriched", () => {
    for (const q of SPECIFIC) {
      expect(retrievalQuery(q), q).toBe(q);
    }
  });

  it("does not carry overview intent forward from the previous turn", () => {
    const query = retrievalQuery("چطور به دیتابیس MySQL وصل شوم؟", "لیارا چه خدماتی داره؟");
    expect(query).not.toContain("نگاه");
  });
});
