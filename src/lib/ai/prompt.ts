import type { SearchHit } from "@/lib/retrieval";

export const CHIP_MARKER_OPEN = "<<<NEXT:";
export const CHIP_MARKER_CLOSE = ">>>";

export const SYSTEM_PROMPT = `تو «Liara Copilot» هستی، دستیار استقرار و مستندات پلتفرم ابری لیارا.

تو یک مهندس DevOps باتجربه‌ای و وظیفه‌ات این است که کاربر را واقعاً راه بیندازی، نه اینکه او را به مستندات حواله بدهی.

قواعد قطعی:
1. مستندات ارائه‌شده در context منبع اصلی و مرجح توست؛ هر جا موضوع را پوشش می‌دهند، بر همان اساس پاسخ بده. اگر مستندات بازیابی‌شده موضوع را کامل پوشش نمی‌دهند، باز هم پاسخ کاربردی بده: از دانش استاندارد خودت درباره لیارا و استقرار برنامه‌های وب استفاده کن، مقادیر پیش‌فرض یا نمونه منطقی بگذار، و آن بخش‌هایی را که از مستندات نیامده با یک جمله کوتاه مشخص کن (مثلاً «این مقدار نمونه است، متناسب با پروژه‌ات تغییرش بده»).
   فقط و فقط وقتی از پاسخ دادن خودداری کن که سؤال هیچ ربطی به استقرار، میزبانی، زیرساخت یا سرویس‌های لیارا نداشته باشد. هرگز به این بهانه که یک فیلد یا جزئیات در سندهای بازیابی‌شده پیدا نشد، از پاسخ دادن طفره نرو.
2. هرگز لینک نساز. لینک منابع به‌صورت خودکار توسط سیستم اضافه می‌شود؛ تو نباید هیچ URL ای بنویسی.
3. به همان زبانی پاسخ بده که کاربر نوشته است (فارسی یا انگلیسی).
4. برای فایل‌های پیکربندی و دستورات، از بلوک کد با زبان مشخص استفاده کن. برای liara.json از \`\`\`json:liara.json و برای دستورات از \`\`\`bash استفاده کن.
5. وقتی کاربر لاگ خطا می‌فرستد، اول علت ریشه‌ای را در یک جمله بگو، سپس دستورهای رفع مشکل را قدم‌به‌قدم بده.
6. کوتاه و عملی بنویس. از مقدمه‌چینی پرهیز کن.
7. وقتی کاربر liara.json یا راه‌اندازی استقرار می‌خواهد، همیشه یک فایل کامل و قابل استفاده بده — نه یک تکه ناقص و نه امتناع. حداقل فیلدهای platform، app و port را متناسب با فریم‌ورک کاربر پر کن و در صورت نیاز disks، cron، build یا healthCheck را هم اضافه کن. اگر نام برنامه یا پورت را نمی‌دانی، یک مقدار نمونه منطقی بگذار (مثلاً app را "my-flask-app" و port را پورت پیش‌فرض همان فریم‌ورک) و زیر کد یک جمله بنویس که کاربر باید آن را با مقدار خودش عوض کند. هرگز نگو «فیلد platform در مستندات پیدا نشد».

در انتهای هر پاسخ، دقیقاً یک خط اضافه کن که شامل ۲ تا ۳ قدم بعدیِ مشخص و مرتبط با همین پاسخ است، با این قالب:
${CHIP_MARKER_OPEN} متن قدم اول | متن قدم دوم | متن قدم سوم ${CHIP_MARKER_CLOSE}

هر قدم باید یک سؤال یا درخواست واقعی و قابل کلیک باشد که کاربر منطقاً بعد از این پاسخ می‌پرسد — نه یک برچسب عمومی. برای نمونه، بعد از ساختن liara.json برای Flask:
${CHIP_MARKER_OPEN} چطور این برنامه را با CLI دیپلوی کنم؟ | یک دیسک برای فایل‌های آپلودی اضافه کن | متغیرهای محیطی را چطور تنظیم کنم؟ ${CHIP_MARKER_CLOSE}

این فقط یک نمونه است؛ عیناً کپی‌اش نکن و هرگز عبارت‌های بی‌معنایی مثل «پیشنهاد اول» یا «قدم دوم» ننویس. قدم‌ها را از دل موضوع همین گفتگو بساز.
این خط باید آخرین خط پاسخ باشد و هیچ متنی بعد از آن نیاید.`;

/**
 * Renders retrieved chunks as the grounding context.
 *
 * URLs are deliberately omitted. The model has no use for them — citations are
 * emitted by the route from the same chunk metadata — and including them is an
 * invitation to paste a mangled one into the prose.
 */
export function buildContext(hits: SearchHit[]): string {
  if (!hits.length) {
    return "مستندات مرتبطی یافت نشد. به کاربر بگو که این موضوع در مستندات لیارا پیدا نشد.";
  }

  const blocks = hits.map((hit, i) => {
    const c = hit.chunk;
    const heading = [c.pageTitle, c.sectionTitle, c.platform]
      .filter(Boolean)
      .join(" / ");
    const code = c.code
      .map((b) => `\`\`\`${b.lang}\n${b.body}\n\`\`\``)
      .join("\n");
    return `[سند ${i + 1}] ${heading}\n${c.text}\n${code}`.trim();
  });

  return `مستندات مرتبط:\n\n${blocks.join("\n\n---\n\n")}`;
}

/**
 * Matches a request to generate/create a liara.json (or "a config file"),
 * in Persian or English. This is intentionally broad — it OR's together the
 * config-noun words (liara.json, کانفیگ, پیکربندی, config) with the common
 * generation verbs (بساز, generate, setup, ایجاد) — because a false positive
 * here only appends extra vocabulary to the retrieval query (see
 * CONFIG_FIELD_VOCAB below); it can pull in the liarajson page as a
 * plausible additional hit, but it cannot forge a top-1 win for it against a
 * query that shares none of that vocabulary. None of it fires on the 15
 * smoke cases in search.test.ts.
 */
const CONFIG_INTENT_RE =
  /liara\.json|کانفیگ|پیکربندی|\bconfig\b|بساز|\bایجاد\b|generate|\bsetup\b/i;

function isConfigGenerationIntent(text: string): boolean {
  return CONFIG_INTENT_RE.test(text);
}

/**
 * Enrichment terms appended to a config-generation query.
 *
 * Retrieval here is per-chunk, not per-page (see bm25.ts), so a page-level
 * signal has to be reconstructed from terms every chunk of the liarajson
 * page actually shares. Two do:
 *
 *  - "liara.json" itself: every one of the page's ~67 chunks repeats it in
 *    pageTitle ("آشنایی با فایل liara.json", weight 4x), so it is the
 *    strongest identifier of "this is the reference page" available without
 *    touching bm25.ts.
 *  - "فیلد" ("field"): the page's per-field chunks are titled "فیلد app",
 *    "فیلد platform", "فیلد port", etc. (section weight 3x) — the exact
 *    chunks that carry the real JSON examples a config-generation answer
 *    needs.
 *  - "پیکربندی" ("configuration"): reinforces the "generate/configure"
 *    framing without being specific to any one field.
 *
 * An earlier version of this list also spelled out the field names
 * themselves (platform, port, app, disks, cron, ...). That measurably
 * backfired: those are common English words that also appear throughout
 * ordinary per-framework quick-start walkthroughs (which set up a port, an
 * app id, etc. as part of deploying, not as reference material), so adding
 * them pulled quick-start pages above the liarajson page instead of below
 * it, and on "liara.json port" it flipped the anchor's top-1 away from
 * paas/liarajson entirely. "فیلد" was kept instead of the field names
 * because it appears in the *reference* page's section titles but rarely in
 * prose that merely uses those fields. See search.test.ts's
 * "config-generation intent" cases for the queries this is measured against.
 */
const CONFIG_FIELD_VOCAB = [
  ...Array(8).fill("liara.json"),
  ...Array(4).fill("پیکربندی"),
  ...Array(10).fill("فیلد"),
].join(" ");

/**
 * The retrieval query. The previous user message is folded in because
 * retrieval runs on every turn without conversation awareness, and a follow-up
 * like "برای Laravel چطور؟" carries almost no searchable signal on its own.
 *
 * When the combined query looks like a request to generate a config file,
 * the liara.json field vocabulary is appended (not substituted) so the
 * reference page's field chunks outrank incidental per-framework mentions —
 * see CONFIG_FIELD_VOCAB.
 */
export function retrievalQuery(current: string, previous?: string): string {
  const base = previous ? `${previous} ${current}` : current;
  return isConfigGenerationIntent(base) ? `${base} ${CONFIG_FIELD_VOCAB}` : base;
}
