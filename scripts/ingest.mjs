#!/usr/bin/env node
/**
 * Converts Liara's MDX documentation into a flat chunk index.
 *
 * The docs are not Markdown. They are MDX with heavy JSX: headings are
 * `<Section title="..." />`, code lives inside `<Highlight>{`...`}</Highlight>`,
 * per-platform variants live inside `<Tabs tabs={[...]} content={[...]}>`, and
 * numbered walkthroughs live inside `<Step steps={[{step, content}, ...]}>`.
 * Decorative `{[...].map(...)}` list renders carry no structured content
 * worth extracting and are dropped outright.
 *
 * Parsing is targeted regex rather than an MDX/estree parse. The component
 * vocabulary is small and consistent, and the JSX-inside-array-prop shape of
 * `<Tabs>` is disproportionately painful to parse properly. A regex miss
 * degrades a chunk's text quality; it does not crash the build.
 *
 * ORDER IS LOAD-BEARING. Code blocks are masked before component stripping.
 * The corpus contains C# `<IActionResult>` and Apache `<IfModule>` inside code
 * blocks, which the component-stripping pass would otherwise mangle.
 */
import fs from "node:fs";
import path from "node:path";

const DOCS_PATH = process.env.DOCS_PATH;
if (!DOCS_PATH) {
  console.error("DOCS_PATH is required. Example:");
  console.error("  DOCS_PATH=/path/to/liara-docs npm run ingest");
  process.exit(1);
}

const PAGES = path.join(DOCS_PATH, "src/pages");
if (!fs.existsSync(PAGES)) {
  console.error(`Not found: ${PAGES}`);
  console.error("DOCS_PATH should be the root of the Liara docs repository.");
  process.exit(1);
}

const OUT = path.join(process.cwd(), "data/docs-index.json");
const MAX_CHARS = 1500;
const MIN_PROSE = 80;

const HIGHLIGHT =
  /<Highlight[^>]*className="([a-zA-Z0-9]+)"[^>]*>\s*\{`([\s\S]*?)`\}\s*<\/Highlight>/g;
const TABS = /<(Tabs|HighlightTabs)\s+tabs=\{\[([\s\S]*?)\]\}\s*content=\{\[([\s\S]*?)\]\}\s*\/?>/g;
// `<Step steps={[{step:"۱", content:(<>...</>)}, ...]}/>` — a numbered-steps
// component shaped like `<Tabs>` but with a `steps` array-of-objects prop
// instead of parallel `tabs`/`content` arrays.
const STEP_OPEN = /<Step\s+steps=\{\[/g;
const STEP_ITEM = /step:\s*"([^"]*)"[\s\S]*?content:\s*\(\s*<>([\s\S]*?)<\/>\s*\)/g;
// `<HighlightTabs tabs={[{label, language, code, description}, ...]}/>` —
// unlike `<Tabs>`, real usage never carries a separate `content=` array; the
// per-item code and (optional) description live inside the same object. The
// old dual-array TABS regex would still "match" this shape by skipping past
// it to the next unrelated `content={[` in the file, silently swallowing
// everything in between — hence bracket-matching instead of a plain regex
// for the array boundary.
const HTABS_OPEN = /<HighlightTabs\s+tabs=\{\[/g;
// The code field is itself a backtick template literal, and a code sample
// can contain its OWN nested (escaped) backtick/`${` — e.g. a JS sample
// building a template string, `\`"my app" <\${MAIL_FROM}>\`, `. A plain
// non-greedy `` `([\s\S]*?)` `` stops at that first escaped backtick,
// truncating the sample. `(?:\\.|[^`\\])*` treats "backslash + any char"
// as one atomic unit so an escaped backtick can't end the capture early.
const HTABS_ITEM =
  /label:\s*"([^"]*)"[\s\S]*?language:\s*"([a-zA-Z0-9]*)"\s*,\s*code:\s*`((?:\\.|[^`\\])*)`(?:[\s\S]*?description:\s*\(\s*<>([\s\S]*?)<\/>\s*\))?/g;
// Inline `{[{...}, {...}].map(...)}` and `{identifier.map(...)}` list
// renders. These are decorative UI generation, not structured content
// worth extracting; dropping the whole expression avoids leaking raw
// JS/object-literal syntax as prose. The arrow function can take any shape
// — `x =>`, `(x) =>`, `(x, i) =>` — with a wrapped `(...)` or bare body, so
// this is matched by bracket/brace depth (see stripMapArrayLiterals)
// rather than another shape-specific regex.
const IDENT_CHAIN = /^[A-Za-z_$][\w$]*(?:\[[^\]]*\]|\.[A-Za-z_$][\w$]*)*/;

/**
 * `<Step>`'s `steps` array can itself contain a nested `<Tabs>`/`<HighlightTabs>`,
 * whose own self-closing `]}/>` would satisfy a naive non-greedy end match for
 * the outer `<Step>` too early, truncating the step list and silently
 * dropping every step after the nested tabs. Track bracket depth instead of
 * relying on the first `]}` seen.
 */
function findMatchingBracket(str, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < str.length; i++) {
    const ch = str[i];
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Finds every group opened by `openRe` (which must end just before the
 * array's `[`) via bracket-depth matching, rather than a non-greedy regex
 * that can leap past an unrelated closing `]}` far later in the file.
 */
function extractBracketGroups(src, openRe) {
  const groups = [];
  openRe.lastIndex = 0;
  let m;
  while ((m = openRe.exec(src))) {
    const openIdx = m.index + m[0].length - 1; // index of the array's '['
    const closeIdx = findMatchingBracket(src, openIdx);
    if (closeIdx === -1) continue;
    const tail = src.slice(closeIdx + 1).match(/^\s*\}\s*\/?>/);
    if (!tail) continue;
    const end = closeIdx + 1 + tail[0].length;
    groups.push({
      fullMatch: src.slice(m.index, end),
      inner: src.slice(openIdx + 1, closeIdx),
    });
    openRe.lastIndex = end;
  }
  return groups;
}

function findMatchingBrace(str, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < str.length; i++) {
    const ch = str[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Drops every `{ <array-literal-or-identifier-chain>.map(...) }` decorative
 * list render in `text`, whatever the arrow-function's shape. Found by
 * scanning for a `{` whose immediate content is either a `[...]` array
 * literal (bracket-depth matched) or an identifier/member-expression chain
 * (`models["x"]`, `item.text`), checking that `.map(` follows directly,
 * then — only then — dropping the *whole* enclosing `{...}` expression via
 * brace-depth matching. Matching by depth rather than a shape-specific
 * regex is what makes this robust to `x =>`, `(x) =>`, `(x, i) =>`, and
 * wrapped vs. bare arrow bodies alike.
 */
function stripMapArrayLiterals(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "{") {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      let exprEnd = -1;
      if (text[j] === "[") {
        const arrClose = findMatchingBracket(text, j);
        if (arrClose !== -1) exprEnd = arrClose + 1;
      } else {
        const m = IDENT_CHAIN.exec(text.slice(j));
        if (m && m[0].length > 0) {
          // The chain regex greedily eats a trailing ".map" as just
          // another property access; back off so the ".map(" check below
          // still sees it.
          const chainLen = m[0].endsWith(".map") ? m[0].length - 4 : m[0].length;
          exprEnd = j + chainLen;
        }
      }
      if (exprEnd !== -1 && /^\s*\.map\(/.test(text.slice(exprEnd))) {
        const braceClose = findMatchingBrace(text, i);
        if (braceClose !== -1) {
          out += " ";
          i = braceClose + 1;
          continue;
        }
      }
    }
    out += text[i];
    i++;
  }
  return out;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".mdx")) out.push(p);
  }
  return out;
}

function urlFor(file) {
  const rel = path.relative(PAGES, file).replace(/\.mdx$/, "").replace(/\/index$/, "");
  return `https://docs.liara.ir/${rel}`;
}

/**
 * Strips the site's title boilerplate. Every page title is of the form
 * "مستندات <subject> - لیارا"; leaving it in place would give those terms a
 * document frequency equal to the corpus size and destroy their IDF.
 */
function cleanTitle(raw) {
  return raw
    .replace(/^\s*مستندات\s+/, "")
    .replace(/\s*-\s*لیارا\s*$/, "")
    .trim();
}

/**
 * A code sample embedded in a `<HighlightTabs>` item's `code` template
 * literal escapes its own backtick/`${` so the outer template literal
 * doesn't interpret them — unescape both so the body reads exactly as the
 * author wrote the sample.
 */
function unescapeCode(s) {
  return s.replace(/\\`/g, "`").replace(/\\\$\{/g, "${");
}

function stripJsx(src) {
  return src
    // Element tags AND bare fragments (`<>`, `</>`) — the optional letter
    // class means a fragment (no tag name) matches too.
    .replace(/<\/?[A-Za-z]?[^>]*>/g, " ")
    .replace(/\{`[\s\S]*?`\}/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Splits a `content={[ <>..</>, <>..</> ]}` array into per-tab fragments. */
function splitTabContent(raw) {
  return raw
    .split(/<\/>\s*,/)
    .map((s) => s.replace(/^\s*,?\s*<>/, "").replace(/<\/>\s*$/, ""))
    .filter((s) => s.trim());
}

const chunks = [];
const files = walk(PAGES);

for (const file of files) {
  let src = fs.readFileSync(file, "utf8");
  const url = urlFor(file);

  const titleMatch = src.match(/<title>([^<]*)<\/title>/);
  const h1Match = src.match(/^#\s+(.+)$/m);
  const pageTitle = cleanTitle(
    titleMatch?.[1] || h1Match?.[1] || path.basename(file, ".mdx"),
  );

  // 1. Mask code blocks FIRST.
  const codes = [];
  src = src.replace(HIGHLIGHT, (_m, lang, body) => {
    codes.push({ lang, body: body.trim() });
    return ` \u0000CODE${codes.length - 1}\u0000 `;
  });

  // 2. Drop imports (multi-line destructuring first, so a wrapped import
  //    doesn't leave its identifier list behind once the line carrying the
  //    `import` keyword is removed) and the page wrapper.
  src = src
    .replace(/^import\s*\{[\s\S]*?\}\s*from\s*["'][^"']*["'];?\s*\n?/gm, "")
    .replace(/^import[^\n]*\n/gm, "")
    .replace(/<Head>[\s\S]*?<\/Head>/g, "")
    .replace(/<\/?Layout>/g, "");

  const emit = (rawText, sectionTitle, platform, seq) => {
    // Drop decorative inline array/map renders here, scoped to this single
    // body/section fragment. Doing this per-fragment (rather than against
    // the whole file) matters: run globally, the non-greedy `[...].map(`
    // match can leap over an unrelated, later `.map(` nested inside a
    // completely different <Tabs>/<Step> block and swallow real content
    // between them.
    // A `<Tabs>` whose `tabs` prop is an array of `{label, icon}` objects
    // (rather than plain label strings) can appear nested inside another
    // Tabs body that the outer (non-greedy) TABS regex swallows whole
    // without separately extracting it; strip its object-literal keys here
    // so they don't leak as prose alongside the JSX icon tag (already
    // handled by stripJsx below).
    const cleaned = stripMapArrayLiterals(rawText)
      .replace(/\blabel:\s*"[^"]*"\s*,?/g, " ")
      .replace(/\bicon:\s*,?/g, " ");
    const used = [...cleaned.matchAll(/\u0000CODE(\d+)\u0000/g)].map(
      (m) => codes[Number(m[1])],
    ).filter(Boolean);
    const text = stripJsx(cleaned.replace(/\u0000CODE\d+\u0000/g, " "));
    if (text.length < MIN_PROSE && used.length === 0) return;

    const parts = Math.max(1, Math.ceil(text.length / MAX_CHARS));
    for (let k = 0; k < parts; k++) {
      const slice = text.slice(k * MAX_CHARS, (k + 1) * MAX_CHARS);
      // A tail part (k > 0) never carries code (see `code:` below), so a
      // tail whose own slice is under MIN_PROSE is nothing but the repeated
      // title/section/platform prefix — drop it rather than emit a
      // near-empty chunk.
      if (k > 0 && slice.trim().length < MIN_PROSE) continue;
      chunks.push({
        id: `${url}#${seq}-${k}`,
        url,
        pageTitle,
        sectionTitle,
        platform,
        // Repeat the titles into every part so context survives the split.
        text: [pageTitle, sectionTitle, platform, slice].filter(Boolean).join(" — "),
        code: k === 0 ? used : [],
      });
    }
  };

  // 3. Pull each `<Step>` group out into per-step chunks, each single-shape
  //    `<HighlightTabs>` group into per-language chunks, then each `<Tabs>`
  //    (and any genuinely dual-shape `<HighlightTabs>`) group into
  //    per-platform chunks — replacing each group in the page body so its
  //    content is not also emitted as prose.
  let seq = 0;
  const stepGroups = extractBracketGroups(src, STEP_OPEN);
  for (const g of stepGroups) {
    const items = [...g.inner.matchAll(STEP_ITEM)];
    items.forEach((m, i) => {
      const [, label, body] = m;
      emit(body, label ? `مرحله ${label}` : null, null, `step${seq}-${i}`);
    });
    src = src.replace(g.fullMatch, " ");
    seq++;
  }

  // `<HighlightTabs>` must be extracted (and removed from `src`) BEFORE the
  // dual-array TABS regex runs: real usage never has its own `content=`
  // prop, so the non-greedy TABS regex would otherwise skip past it looking
  // for the next unrelated `content={[` in the file — matching across huge,
  // unrelated spans of the page and swallowing everything in between.
  const htabsGroups = extractBracketGroups(src, HTABS_OPEN);
  for (const g of htabsGroups) {
    const items = [...g.inner.matchAll(HTABS_ITEM)];
    items.forEach((m, i) => {
      const [, label, lang, code, description] = m;
      const idx = codes.push({ lang, body: unescapeCode(code.trim()) }) - 1;
      const body = `${description || ""} \u0000CODE${idx}\u0000 `;
      emit(body, null, label || null, `htabs${seq}-${i}`);
    });
    src = src.replace(g.fullMatch, " ");
    seq++;
  }

  const tabGroups = [...src.matchAll(TABS)];
  for (const g of tabGroups) {
    const labels = [...g[2].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    const bodies = splitTabContent(g[3]);
    for (let i = 0; i < labels.length; i++) {
      if (!bodies[i]) continue;
      emit(bodies[i], null, labels[i], `tab${seq}-${i}`);
    }
    src = src.replace(g[0], " ");
    seq++;
  }

  // 4. Split what remains on `<Section>` boundaries.
  const sectionTitles = [...src.matchAll(/<Section\s[^>]*title="([^"]*)"/g)].map(
    (m) => m[1],
  );
  const parts = src.split(/<Section\s[^>]*\/>/);
  parts.forEach((part, i) => {
    // Positional fallback: some `<Section>` tags carry no title attribute, so
    // the titles array can be shorter than the split array.
    emit(part, i === 0 ? null : (sectionTitles[i - 1] ?? null), null, i);
  });
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(chunks));

const bytes = fs.statSync(OUT).size;
const codeBlockCount = chunks.reduce((n, c) => n + c.code.length, 0);
const badUrls = chunks.filter((c) => !/^https:\/\/docs\.liara\.ir\/[\w\-/]*$/.test(c.url)).length;
console.log(`files:       ${files.length}`);
console.log(`chunks:      ${chunks.length}`);
console.log(`code blocks: ${codeBlockCount}`);
console.log(`bad urls:    ${badUrls}`);
console.log(`output: ${OUT} (${(bytes / 1048576).toFixed(2)} MB)`);
