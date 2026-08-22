import type { SearchHit } from "@/lib/retrieval";
import { tokenize } from "@/lib/retrieval/tokenize";

export const CHIP_MARKER_OPEN = "<<<NEXT:";
export const CHIP_MARKER_CLOSE = ">>>";

export const SYSTEM_PROMPT = `تو «Liara Copilot» هستی، دستیار استقرار و مستندات پلتفرم ابری لیارا.

تو یک مهندس DevOps باتجربه‌ای و وظیفه‌ات این است که کاربر را واقعاً راه بیندازی، نه اینکه او را به مستندات حواله بدهی.

قواعد قطعی:
1. مستندات ارائه‌شده در context منبع اصلی و مرجح توست؛ هر جا موضوع را پوشش می‌دهند، بر همان اساس پاسخ بده. اگر مستندات بازیابی‌شده موضوع را کامل پوشش نمی‌دهند، باز هم پاسخ کاربردی بده: از دانش استاندارد خودت درباره لیارا و استقرار برنامه‌های وب استفاده کن، مقادیر پیش‌فرض یا نمونه منطقی بگذار، و آن بخش‌هایی را که از مستندات نیامده با یک جمله کوتاه مشخص کن (مثلاً «این مقدار نمونه است، متناسب با پروژه‌ات تغییرش بده»).
   امتناع فقط برای سؤالی مجاز است که موضوعش کلاً بیرون از حوزه ابر، استقرار و توسعه نرم‌افزار باشد — مثل آب‌وهوا، شعر، ورزش یا آشپزی. در آن حالت هم فقط یک جمله کوتاه بگو و کاربر را به موضوع برگردان. هرگز به این بهانه که یک فیلد یا جزئیات در سندهای بازیابی‌شده پیدا نشد، از پاسخ دادن طفره نرو، و هرگز نگو سؤال «مرتبط نیست» وقتی سؤال درباره خود لیارا یا هر بخشی از کار با آن است.
2. هرگز لینک نساز. لینک منابع به‌صورت خودکار توسط سیستم اضافه می‌شود؛ تو نباید هیچ URL ای بنویسی.
3. به همان زبانی پاسخ بده که کاربر نوشته است (فارسی یا انگلیسی).
4. برای فایل‌های پیکربندی و دستورات، از بلوک کد با زبان مشخص استفاده کن. برای liara.json از \`\`\`json:liara.json و برای دستورات از \`\`\`bash استفاده کن.
5. وقتی کاربر لاگ خطا می‌فرستد، اول علت ریشه‌ای را در یک جمله بگو، سپس دستورهای رفع مشکل را قدم‌به‌قدم بده.
6. کوتاه و عملی بنویس. از مقدمه‌چینی پرهیز کن.
7. وقتی کاربر liara.json یا راه‌اندازی استقرار می‌خواهد، همیشه یک فایل کامل و قابل استفاده بده — نه یک تکه ناقص و نه امتناع. حداقل فیلدهای platform، app و port را متناسب با فریم‌ورک کاربر پر کن و در صورت نیاز disks، cron، build یا healthCheck را هم اضافه کن. اگر نام برنامه یا پورت را نمی‌دانی، یک مقدار نمونه منطقی بگذار (مثلاً app را "my-flask-app" و port را پورت پیش‌فرض همان فریم‌ورک) و زیر کد یک جمله بنویس که کاربر باید آن را با مقدار خودش عوض کند. هرگز نگو «فیلد platform در مستندات پیدا نشد».
8. سؤال‌های کلی و معرفی‌محور درباره خود لیارا («لیارا چه خدماتی دارد؟»، «لیارا چیست؟»، «با لیارا چه کارهایی می‌شود کرد؟») کاملاً در حوزه توست و امتناع از آن‌ها خطاست. سرویس‌های لیارا اینها هستند: PaaS (استقرار برنامه روی پلتفرم)، DBaaS (دیتابیس به‌عنوان سرویس)، IaaS (سرور مجازی ابری / VPS)، AI (API هوش مصنوعی سازگار با OpenAI)، Object Storage سازگار با S3، سامانه مدیریت دامنه و DNS، برنامه‌های آماده (One Click Apps) و ایمیل‌سرور. برای چنین سؤالی این سرویس‌ها را فهرست کن، برای هرکدام یک خط توضیح بده و بپرس کاربر می‌خواهد روی کدام‌یک عمیق‌تر برود.
9. «اول ابهام را رفع کن»: اگر درخواست کاربر یک پارامتر فنی حیاتی را مشخص نکرده و پاسخ نهایی واقعاً به آن وابسته است — مثلاً «برنامه‌ام را چطور دیپلوی کنم؟» بدون نام فریم‌ورک، یا «چطور دیتابیس راه بیندازم؟» بدون نوع دیتابیس — نه فرض بگیر و نه آموزش عمومی و همه‌حالته تحویل بده. به‌جایش یک یا حداکثر دو سؤال کوتاه و دقیق بپرس، گزینه‌های محتمل را به‌صورت فهرست بولت زیرش بگذار، و همان‌جا تمام کن تا کاربر جواب بدهد. قیدهای این قاعده:
   - فقط وقتی فعال است که پاسخ با هر گزینه واقعاً متفاوت شود. اگر جواب برای همه گزینه‌ها یکسان است (مثلاً «لاگ‌ها را چطور ببینم؟»)، مستقیم جواب بده.
   - اگر کاربر آن پارامتر را در همین پیام یا در پیام‌های قبلی همین گفتگو گفته است، دوباره نپرس؛ همان را استفاده کن.
   - این قاعده بر قاعده ۷ مقدم است: تا وقتی فریم‌ورک یا پلتفرم روشن نشده، liara.json نساز.
   - این قاعده بهانه امتناع یا تعویق نیست. فقط یک نوبت سؤال؛ اگر کاربر جواب نداد، گفت «فرقی نمی‌کند» یا خواست خودت انتخاب کنی، بلافاصله طبق قاعده ۷ با یک گزینه پیش‌فرض منطقی پاسخ کامل بده و بنویس کدام را فرض گرفتی. هرگز دو نوبت پشت‌هم سؤال نپرس.
   - فقط سراغ همان پارامتری برو که پاسخ را عوض می‌کند (مثلاً فریم‌ورک یا نوع دیتابیس). چیزهایی مثل نام برنامه و پورت را نپرس؛ آن‌ها طبق قاعده ۷ مقدار نمونه می‌گیرند.
   - حداکثر ۳ گزینه پیشنهاد بده، چون خط قدم‌های بعدی بیش از ۳ مورد را نشان نمی‌دهد. اگر گزینه‌های محتمل بیشتر است، ۳ مورد رایج را بگذار و بنویس کاربر می‌تواند گزینه دیگری هم بنویسد.
   - در نوبت رفع ابهام هم خط قدم‌های بعدی اجباری است و همان گزینه‌ها را در آن بگذار تا کاربر با یک کلیک جواب بدهد (مثلاً: Next.js | Laravel | Django). اگر آن پارامتر فهرست گزینه ندارد، محتمل‌ترین مقادیر را به‌عنوان گزینه بگذار — این خط را هرگز حذف نکن.

در انتهای هر پاسخ، دقیقاً یک خط اضافه کن که شامل ۲ تا ۳ قدم بعدیِ مشخص و مرتبط با همین پاسخ است، با این قالب:
${CHIP_MARKER_OPEN} متن قدم اول | متن قدم دوم | متن قدم سوم ${CHIP_MARKER_CLOSE}

هر قدم باید یک سؤال یا درخواست واقعی و قابل کلیک باشد که کاربر منطقاً بعد از این پاسخ می‌پرسد — نه یک برچسب عمومی. برای نمونه، بعد از ساختن liara.json برای Flask:
${CHIP_MARKER_OPEN} چطور این برنامه را با CLI دیپلوی کنم؟ | یک دیسک برای فایل‌های آپلودی اضافه کن | متغیرهای محیطی را چطور تنظیم کنم؟ ${CHIP_MARKER_CLOSE}

استثنا: در نوبت رفع ابهام (قاعده ۹) قدم‌ها همان گزینه‌های پاسخِ آن سؤال‌اند، نه سؤال بعدی.

این فقط یک نمونه است؛ عیناً کپی‌اش نکن و هرگز عبارت‌های بی‌معنایی مثل «پیشنهاد اول» یا «قدم دوم» ننویس. قدم‌ها را از دل موضوع همین گفتگو بساز.
این خط باید آخرین خط پاسخ باشد و هیچ متنی بعد از آن نیاید.`;

/**
 * Below this top-1 BM25 score the retrieved set is treated as noise rather
 * than as documentation.
 *
 * Measured over the committed index. Sixteen questions that retrieve
 * correctly score 6.54 (NextJS deploy) to 74.68 (a config-generation
 * request) at top-1. A query whose only indexed token is a very common one
 * scores about 1.7: «لیارا چه خدماتی داره؟» scored 1.74, because «خدماتی»
 * and «داره» have df 0 in this corpus — it spells them «خدمات» and «ارائه
 * می‌دهد» — leaving «لیارا» (df 1749 of 4050) to rank the whole corpus. The
 * top-6 it produced was the CLI delete-domain page, the team-roles page and
 * the console page.
 *
 * The scores are unnormalized, so this is a floor on "did any query term
 * discriminate at all", not a relevance percentage. It is deliberately much
 * closer to the noise value than to the lowest good one.
 *
 * It is NOT a topicality gate and must never be used as one: «دستور پخت
 * قرمه سبزی» scores 10.49 against this corpus. Deciding what is off-domain
 * is the prompt's job; this only decides how much the context is trusted.
 */
const MIN_GROUNDING_SCORE = 4;

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

  // A weak top-1 gets the same anti-refusal framing as no hits at all, and
  // the chunks are passed through underneath it rather than dropped — they
  // are occasionally still useful, and the model is told not to rely on them.
  //
  // This branch is the direct cause of the reported defect. Asked «لیارا چه
  // خدماتی داره؟» the model replied «سوال شما مرتبط با خدمات خاص لیارا نیست و
  // من نمی‌توانم به آن پاسخ دهم.» Retrieval had not come back empty — so the
  // careful anti-refusal wording of the branch above never ran — it came back
  // with six unrelated chunks at score 1.74, labelled «مستندات مرتبط». Given
  // a broad question and six irrelevant documents presented as the relevant
  // ones, the only consistent move left in the prompt was rule 1's refusal.
  if ((hits[0]?.score ?? 0) < MIN_GROUNDING_SCORE) {
    return `هیچ‌کدام از اسناد بازیابی‌شده به‌روشنی به این سؤال مربوط نیست (امتیاز بازیابی بسیار پایین بود). به اسناد زیر تکیه نکن و آن‌ها را مرتبط فرض نکن؛ طبق قاعده ۱ با دانش عمومی خودت درباره لیارا و استقرار برنامه‌های وب یک پاسخ کاربردی و کامل بده و در یک جمله کوتاه بگو که این پاسخ از مستندات بازیابی‌شده نیامده. این‌که موضوع در اسناد نبود دلیلی برای امتناع نیست؛ فقط اگر سؤال هیچ ربطی به لیارا و حوزه ابر و استقرار ندارد از پاسخ دادن خودداری کن.\n\nاسناد بازیابی‌شده (احتمالاً بی‌ربط):\n\n${blocks.join("\n\n---\n\n")}`;
  }

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
const CONFIG_ENRICHMENT: Vocabulary = [
  ["liara.json", 8],
  ["پیکربندی", 4],
  ["فیلد", 10],
];

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

type Vocabulary = Array<[term: string, share: number]>;

function enrichment(base: string, vocabulary: Vocabulary): string {
  const shareTotal = vocabulary.reduce((a, [, w]) => a + w, 0);
  const budget = Math.max(
    ENRICHMENT_BUDGET_FLOOR,
    Math.round(tokenize(base).length * ENRICHMENT_BUDGET_RATIO),
  );
  return vocabulary
    .flatMap(([term, share]) =>
      Array(Math.max(1, Math.round((budget * share) / shareTotal))).fill(term),
    )
    .join(" ");
}

/**
 * Overview intent: a broad question about what Liara *is* or what it offers,
 * as opposed to a question about one of its services.
 *
 * This is the second half of the reported defect. «لیارا چه خدماتی داره؟»
 * retrieved six unrelated chunks at score 1.74 because its only indexed token
 * was «لیارا» (df 1749 of 4050) — «خدماتی» and «داره» have df 0; the corpus
 * writes «خدمات» and «ارائه می‌دهد». The page that answers the question exists
 * and is unambiguous: overview/about («لیارا در یک نگاه»), whose first two
 * chunks name PaaS, DBaaS, IaaS, AI, S3-compatible Object Storage, DNS
 * management, One Click Apps and Email Server.
 *
 * Detection is a WHITELIST, not the noun/verb-proximity pair the config
 * intent uses, and deliberately so. The enrichment vocabulary below leans on
 * «نگاه» (df 20), rare enough that it decides the ranking on its own rather
 * than re-ranking the user's candidate set — measured top-1 scores land near
 * 55 against the 6-13 a normal query produces. For the target queries that is
 * the point: the user's own words carry almost no retrievable signal. But it
 * means a false positive replaces a real question instead of nudging it, so
 * the rule is that EVERY content token must be a platform-scope word. Any
 * mention of a specific service, framework, file or task vetoes it
 * automatically, with no blocklist to keep in sync with the corpus:
 * «دیتابیس», «liara.json», «object», «flask», «cron» are simply not on the
 * list. At least one BROAD term is also required, so «چطور؟» alone does not
 * fire.
 */
const OVERVIEW_BROAD = new Set([
  // Persian: catalogue nouns and the bare "what is it / what does it do".
  "خدمات", "خدماتی", "سرویس", "سرویسها", "سرویسهای", "امکانات", "امکاناتی",
  "قابلیت", "قابلیتها", "قابلیتهای", "محصولات", "محصول",
  "چیست", "چیه", "چیکار", "کارهایی", "کارها", "معرفی",
  // English.
  "services", "service", "features", "feature", "products", "product",
  "offer", "offers", "offering", "offerings", "capabilities", "overview",
]);

/**
 * Words allowed alongside the broad terms without being sufficient on their
 * own: the platform's own name, and the colloquial have/do verbs that Persian
 * questions of this shape are built from. «دارد», «دارند», «چه» and friends
 * are absent because `tokenize` already drops them as stopwords.
 */
const OVERVIEW_FILLER = new Set([
  "لیارا", "liara",
  "داره", "دارید", "داری", "دارن", "میکنه", "میکند", "میده", "میدهد",
  "ارائه", "میشه", "بشه", "بگو", "بده",
  "what", "which", "does", "do", "provide", "provides", "there", "about",
]);

function isOverviewIntent(text: string): boolean {
  const tokens = tokenize(text);
  if (!tokens.length) return false;
  if (!tokens.some((t) => OVERVIEW_BROAD.has(t))) return false;
  return tokens.every((t) => OVERVIEW_BROAD.has(t) || OVERVIEW_FILLER.has(t));
}

/**
 * Enrichment terms for an overview question, as explicit weights.
 *
 * «نگاه» is the load-bearing one: it comes from the page title «لیارا در یک
 * نگاه», which every one of the page's ten chunks repeats, and with df 20 it
 * is the rarest page-level identifier available without touching bm25.ts. The
 * other three keep the intro chunks — the ones that actually enumerate the
 * service lines — ahead of the per-service sections of the same page.
 *
 * Measured over the committed index against seven phrasings of the question
 * (Persian colloquial, Persian formal, and English): this vocabulary puts an
 * overview/about chunk at top-1 for all seven. Two alternatives were tried —
 * «نگاه»+«لیارا» alone lost «لیارا چیست؟» to the AI overview page (which
 * shares the «در یک نگاه» title pattern), and «نگاه»+«زیرساخت» ranked the
 * IaaS section above the intro that lists everything.
 */
const OVERVIEW_ENRICHMENT: Vocabulary = [
  ["نگاه", 8],
  ["خدمات", 4],
  ["سرویس", 3],
  ["زیرساخت", 3],
];

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
  // Both intents are read off the CURRENT turn only, so neither carries
  // forward into an unrelated follow-up.
  if (isConfigGenerationIntent(current)) {
    return `${base} ${enrichment(current, CONFIG_ENRICHMENT)}`;
  }
  if (isOverviewIntent(current)) {
    return `${base} ${enrichment(current, OVERVIEW_ENRICHMENT)}`;
  }
  return base;
}
