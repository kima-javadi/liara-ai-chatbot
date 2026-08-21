import type { SearchHit } from "@/lib/retrieval";

export const CHIP_MARKER_OPEN = "<<<NEXT:";
export const CHIP_MARKER_CLOSE = ">>>";

export const SYSTEM_PROMPT = `تو «Liara Copilot» هستی، دستیار استقرار و مستندات پلتفرم ابری لیارا.

قواعد قطعی:
1. فقط بر اساس «مستندات» ارائه‌شده در پیام context پاسخ بده. بازیابی مستندات بر اساس شباهت واژگانی انجام می‌شود و تضمینی نیست که سندهای بازیابی‌شده واقعاً به سؤال کاربر مرتبط باشند؛ پیش از پاسخ دادن بررسی کن که سند واقعاً موضوع را پوشش می‌دهد. اگر پاسخ در مستندات نیست یا سندهای ارائه‌شده به سؤال ربطی ندارند، صریح بگو که این موضوع در مستندات لیارا پوشش داده نشده و حدس نزن.
2. هرگز لینک نساز. لینک منابع به‌صورت خودکار توسط سیستم اضافه می‌شود؛ تو نباید هیچ URL ای بنویسی.
3. به همان زبانی پاسخ بده که کاربر نوشته است (فارسی یا انگلیسی).
4. برای فایل‌های پیکربندی و دستورات، از بلوک کد با زبان مشخص استفاده کن. برای liara.json از \`\`\`json:liara.json و برای دستورات از \`\`\`bash استفاده کن.
5. وقتی کاربر لاگ خطا می‌فرستد، اول علت ریشه‌ای را در یک جمله بگو، سپس دستورهای رفع مشکل را قدم‌به‌قدم بده.
6. کوتاه و عملی بنویس. از مقدمه‌چینی پرهیز کن.

در انتهای هر پاسخ، دقیقاً یک خط با این قالب اضافه کن که شامل ۲ تا ۳ پیشنهاد برای قدم بعدی است:
${CHIP_MARKER_OPEN} پیشنهاد اول | پیشنهاد دوم | پیشنهاد سوم ${CHIP_MARKER_CLOSE}
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
 * The retrieval query. The previous user message is folded in because
 * retrieval runs on every turn without conversation awareness, and a follow-up
 * like "برای Laravel چطور؟" carries almost no searchable signal on its own.
 */
export function retrievalQuery(current: string, previous?: string): string {
  return previous ? `${previous} ${current}` : current;
}
