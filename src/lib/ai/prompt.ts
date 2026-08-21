import type { SearchHit } from "@/lib/retrieval";
import { tokenize } from "@/lib/retrieval/tokenize";

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
  // No hits is not an instruction to refuse. It used to say "tell the user
  // this topic was not found in the Liara docs", which overrode rule 1's
  // anti-over-refusal wording and produced exactly that refusal live. It now
  // says the same thing rule 1 does: answer anyway, from general knowledge,
  // and flag that the answer is not drawn from the retrieved documentation.
  if (!hits.length) {
    return "مستندات مرتبطی برای این سؤال بازیابی نشد. طبق قاعده ۱ پاسخ بده: از دانش عمومی خودت درباره لیارا و استقرار برنامه‌های وب یک پاسخ کاربردی و کامل بده، و در یک جمله کوتاه بگو که این پاسخ از مستندات بازیابی‌شده نیامده و بهتر است کاربر آن را با مستندات رسمی لیارا تطبیق دهد. فقط اگر سؤال هیچ ربطی به استقرار، میزبانی یا سرویس‌های لیارا ندارد از پاسخ دادن خودداری کن.";
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
 * Detects a request to *generate* a config file (a liara.json, or "a config
 * file"), in Persian or English.
 *
 * This used to OR the config nouns together with the generation verbs, on the
 * theory that a false positive could only add vocabulary and never win a
 * ranking. That theory was wrong and measurably so: "how to setup a redis
 * database" fired on the bare word `setup`, and the enrichment then took the
 * entire top-6 from Redis restore-backup pages to paas/liarajson, with zero
 * Redis documentation retrieved. So both halves are now required, and both are
 * narrower:
 *
 *  - the noun must actually name a config file. Bare `config` is gone —
 *    "config nginx for laravel" is a request about nginx, not about
 *    liara.json.
 *  - the verb must actually ask for something to be produced, and `setup`
 *    only counts alongside one of those nouns.
 *
 * They must also appear near each other, so a long message that happens to
 * mention a liara.json in one paragraph and "create a database" in another
 * does not trip it.
 */
const CONFIG_NOUN_RE =
  /liara\.json|کانفیگ|پیکربندی|config(?:uration)?[ -]file|فایل\s+config/gi;
const GEN_VERB_RE =
  /بساز|بنویس|تولید\s*کن|ایجاد\s*کن|\bgenerate\b|\bcreate\b|\bscaffold\b|\bwrite\b|\bmake\b|\bset\s?up\b/gi;

/** Max characters between the verb and the noun for them to count as one request. */
const INTENT_PROXIMITY = 60;

function matchOffsets(re: RegExp, text: string): number[] {
  re.lastIndex = 0;
  const out: number[] = [];
  for (const m of text.matchAll(re)) out.push(m.index);
  return out;
}

function isConfigGenerationIntent(text: string): boolean {
  const nouns = matchOffsets(CONFIG_NOUN_RE, text);
  if (!nouns.length) return false;
  const verbs = matchOffsets(GEN_VERB_RE, text);
  return verbs.some((v) => nouns.some((n) => Math.abs(v - n) <= INTENT_PROXIMITY));
}

/**
 * Enrichment terms appended to a config-generation query, as explicit weights.
 *
 * Retrieval here is per-chunk, not per-page (see bm25.ts), so a page-level
 * signal has to be reconstructed from terms every chunk of the liarajson
 * page actually shares. Three do:
 *
 *  - "liara.json" itself: every one of the page's ~67 chunks repeats it in
 *    pageTitle, so it is the strongest identifier of "this is the reference
 *    page" available without touching bm25.ts.
 *  - "فیلد" ("field"): the page's per-field chunks are titled "فیلد app",
 *    "فیلد platform", "فیلد port" — the exact chunks that carry the real JSON
 *    examples a config-generation answer needs. Kept in preference to the
 *    field names themselves (platform, port, app, ...), which are common
 *    English words that pulled per-framework quick-starts up instead.
 *  - "پیکربندی" ("configuration"): reinforces the framing without being
 *    specific to any one field.
 *
 * The weights are RELATIVE, not absolute. A fixed 22 repeated tokens appended
 * to a 5-token question outscored the user's own words about ten to one and
 * collapsed the whole top-6 onto one page — the enrichment stopped being a
 * re-ranking signal and became the query. The budget is therefore scaled to
 * the length of the base query (see ENRICHMENT_BUDGET_RATIO), so enrichment
 * can reorder the candidate set the user's words select but never replace it.
 */
const CONFIG_ENRICHMENT: Array<[term: string, share: number]> = [
  ["liara.json", 8],
  ["پیکربندی", 4],
  ["فیلد", 10],
];
const ENRICHMENT_SHARE_TOTAL = CONFIG_ENRICHMENT.reduce((a, [, w]) => a + w, 0);

/**
 * Total enrichment weight: one unit per token the user actually typed, with a
 * floor so that a very short request ("یک کانفیگ برای برنامه Go بساز",
 * 4 tokens) still carries enough signal to reorder anything.
 *
 * Both numbers were measured, not guessed. Sweeping the budget over the four
 * config-generation phrasings against the real index:
 *
 *   budget = tokens          → 2 of 4 rank paas/liarajson first
 *   budget = max(8, tokens)  → 4 of 4, and it is the smallest floor that does
 *   budget = 2 x tokens      → 4 of 4, at roughly double the enrichment weight
 *
 * The previous fixed 22 tokens is what let the enrichment dominate; at
 * max(8, tokens) an 11-token request gets 11, not 22.
 */
const ENRICHMENT_BUDGET_RATIO = 1;
const ENRICHMENT_BUDGET_FLOOR = 8;

function enrichment(base: string): string {
  const budget = Math.max(
    ENRICHMENT_BUDGET_FLOOR,
    Math.round(tokenize(base).length * ENRICHMENT_BUDGET_RATIO),
  );
  return CONFIG_ENRICHMENT.flatMap(([term, share]) =>
    Array(Math.max(1, Math.round((budget * share) / ENRICHMENT_SHARE_TOTAL))).fill(term),
  ).join(" ");
}

/**
 * The current turn is folded in at EQUAL weight with the previous one.
 *
 * An earlier revision up-weighted the current message 3x, to stop the previous
 * turn outvoting it. That was overfitted: the multiplier was chosen on the same
 * six exchanges it was measured against. Re-measured on a set that separates
 * the two kinds of follow-up — anaphoric ("نمونه‌اش را نشان بده", which has no
 * searchable content of its own) from contentful ("چطور به دیتابیس MySQL وصل
 * شوم؟", which does:
 *
 *   weight 1 -> anaphoric 4/4, contentful 2/3, total 6/7   <- chosen
 *   weight 2 -> anaphoric 3/4, contentful 2/3, total 5/7
 *   weight 3 -> anaphoric 2/4, contentful 3/3, total 5/7
 *
 * Up-weighting trades the anaphoric class away to buy the contentful one, and
 * the anaphoric class is precisely what folding the previous turn exists to
 * serve. At weight 3 "تنظیم cron job در لیارا" / "نمونه‌اش را نشان بده"
 * retrieves dbaas/mysql/create-user; at weight 1 it retrieves set-cron-job.
 *
 * KNOWN MISS at weight 1: "چطور به دیتابیس MySQL وصل شوم؟" straight after a
 * liara.json request retrieves paas/flask/how-tos/connect-to-db/sqlite rather
 * than a MySQL page — the previous turn's own tokens, not the config
 * enrichment (which correctly no longer fires), still dominate. Separating
 * those two classes needs the query's discriminative power against the corpus,
 * not a fixed multiplier; token count does not distinguish them (both are 4
 * tokens) and neither does document frequency (the anaphoric words are
 * themselves rare). Left as a measured, documented miss rather than tuned away.
 */
export function retrievalQuery(current: string, previous?: string): string {
  const base = previous ? `${previous} ${current}` : current;
  return isConfigGenerationIntent(current)
    ? `${base} ${enrichment(current)}`
    : base;
}
