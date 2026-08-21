/**
 * Persian stopwords, plus a small set of English words that appear constantly
 * in the docs without carrying retrieval signal.
 *
 * Deliberately excludes technical words that look like stopwords but are not:
 * "in", "on", and "up" are not listed because `liara logs -f`, `npm run`, and
 * similar phrasings depend on short English tokens.
 */
export const STOPWORDS = new Set([
  // Persian
  "و", "در", "به", "از", "که", "این", "را", "با", "است", "برای", "آن", "یک",
  "خود", "تا", "کرد", "بر", "هم", "نیز", "شده", "های", "شود", "می", "بود",
  "یا", "ها", "کند", "کنید", "کنیم", "شما", "ما", "او", "آنها", "اگر", "پس",
  "چون", "دیگر", "همه", "هر", "باید", "بعد", "قبل", "روی", "زیر", "بین",
  "وقتی", "چه", "کدام", "چرا", "چگونه", "کجا", "کی", "آیا", "بله", "خیر",
  "نه", "فقط", "حتی", "مانند", "مثل", "طور", "نوع", "مورد", "طریق", "توسط",
  "درباره", "بدون", "همچنین", "بنابراین", "اما", "ولی", "زیرا", "سپس",
  "اکنون", "الان", "همیشه", "هرگز", "شاید", "باشد", "بودن", "دارد", "دارند",
  "داشته", "کردن", "شدن", "گرفت", "داد", "آمد", "رفت", "دهد", "گیرد",
  "خواهد", "توان", "میتوان", "نمی", "بیشتر", "کمتر", "خیلی", "بسیار",
  "چند", "همان", "آنچه", "کل", "تمام", "سایر", "برخی", "یعنی",
  // English filler
  "the", "a", "an", "and", "or", "of", "to", "is", "are", "was", "were",
  "be", "been", "it", "this", "that", "these", "those", "you", "your",
  "we", "our", "can", "will", "would", "should", "if", "then", "than",
  "for", "with", "from", "as", "at", "by",
]);
