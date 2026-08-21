import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";

const INDEX = path.join(process.cwd(), "data/docs-index.json");

describe("docs index", () => {
  let chunks;

  beforeAll(() => {
    if (!fs.existsSync(INDEX)) {
      throw new Error("data/docs-index.json missing. Run: DOCS_PATH=... npm run ingest");
    }
    chunks = JSON.parse(fs.readFileSync(INDEX, "utf8"));
  });

  it("contains a substantial number of chunks", () => {
    expect(chunks.length).toBeGreaterThan(2000);
  });

  it("gives every chunk a well-formed docs.liara.ir URL", () => {
    const bad = chunks.filter((c) => !/^https:\/\/docs\.liara\.ir\/[\w\-/]*$/.test(c.url));
    expect(bad.map((c) => c.url).slice(0, 5)).toEqual([]);
  });

  it("leaks no raw MDX into chunk text", () => {
    const bad = chunks.filter((c) =>
      /<Highlight|<Section|^import |<Layout|\u0000CODE/.test(c.text),
    );
    expect(bad.map((c) => c.id).slice(0, 5)).toEqual([]);
  });

  it("produces tab-derived chunks carrying a platform label", () => {
    const tabbed = chunks.filter((c) => c.platform);
    expect(tabbed.length).toBeGreaterThan(500);
  });

  it("leaks no bare JSX fragments into chunk text", () => {
    // `<Section>`'s tag regex requires a letter after `<`/`</`, so a bare
    // `<>`/`</>` fragment (common in <Tabs>/<Step>/<HighlightTabs> bodies)
    // used to survive stripping verbatim.
    const bad = chunks.filter((c) => /<\/?>/.test(c.text));
    expect(bad.map((c) => c.id).slice(0, 5)).toEqual([]);
  });

  it("leaks no array/object-literal debris from Step, HighlightTabs, or inline .map() renders", () => {
    // Component shapes whose per-item data lives in a JS object/array
    // literal (`<Step steps={[{step, content}]}>`, `<HighlightTabs
    // tabs={[{label, language, code}]}>`, an inline `{label, icon}` tabs
    // array, or a decorative `{[...].map(...)}` list) leak their key names
    // and punctuation as prose if the extraction regex mismatches the
    // component's true boundary. `.map(` is asserted bare (not `.map((`)
    // because the call can take any arrow-function shape — `x =>`,
    // `(x) =>`, `(x, i) =>` — and a shape-specific pattern here previously
    // let the single-paren, unwrapped-body form (the corpus's common one)
    // straight through.
    const debrisPattern =
      /\bstep:\s*"|\bcontent:\s*\(|\blabel:\s*"|\blanguage:\s*"|\bicon:\s*,|\balt:\s*['"]|\blink:\s*['"]|\bplatform:\s*['"]|\btitle:\s*['"]|\.map\(/;
    const bad = chunks.filter((c) => debrisPattern.test(c.text));
    expect(bad.map((c) => c.id).slice(0, 5)).toEqual([]);
  });

  it("leaks no import-continuation tail from a multi-line import", () => {
    // A destructuring import wrapped over several lines
    // (`import {\n  A,\n  B,\n} from "pkg";`) used to have only the line
    // carrying the `import` keyword removed, leaving the identifier list
    // and the `from "pkg";` tail behind as raw text.
    const bad = chunks.filter((c) => /\bfrom\s*["'][\w@/.-]+["'];?/.test(c.text));
    expect(bad.map((c) => c.id).slice(0, 5)).toEqual([]);
  });

  it("never emits a chunk whose text is only the title/section/platform prefix", () => {
    // Every chunk's text is `[pageTitle, sectionTitle, platform, content]`
    // joined with " — "; a chunk that carries no code of its own must have
    // real content beyond that prefix, or it's dead weight for retrieval.
    // Code-only chunks (`code.length > 0`) are exempt: their payload is the
    // attached code, not the text.
    const bad = chunks.filter((c) => {
      if (c.code.length > 0) return false;
      const prefix = [c.pageTitle, c.sectionTitle, c.platform].filter(Boolean).join(" — ");
      const rest =
        c.text.indexOf(prefix) === 0
          ? c.text.slice(prefix.length).replace(/^\s*—\s*/, "")
          : c.text;
      return !rest.trim();
    });
    expect(bad.map((c) => c.id).slice(0, 5)).toEqual([]);
  });

  it("never truncates a code body mid-escape", () => {
    // The tell-tale sign of a non-greedy backtick capture stopping at an
    // escaped `\`` inside the sample (rather than the real closing
    // backtick): the captured body ends on a dangling backslash.
    const bad = [];
    for (const c of chunks) {
      for (const cb of c.code) {
        if (/\\$/.test(cb.body)) bad.push(c.id);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it("never emits a code body implausibly short next to its same-language siblings", () => {
    // Group code bodies by (url, lang) — parallel examples for the same
    // task/platform set should be roughly comparable in length. Flag a
    // body only when it is BOTH far shorter than its longest sibling AND
    // has more open braces/parens than closes — the actual signature of a
    // truncated capture (e.g. `const mailOptions = {\n  from: "` has an
    // unclosed `{`). Short-but-complete siblings (a one-line shell command
    // next to a full example) are balanced and so aren't flagged.
    const byKey = new Map();
    for (const c of chunks) {
      for (const cb of c.code) {
        const key = `${c.url}::${cb.lang}`;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push({ id: c.id, body: cb.body });
      }
    }
    const bad = [];
    for (const entries of byKey.values()) {
      if (entries.length < 2) continue;
      const max = Math.max(...entries.map((e) => e.body.length));
      for (const e of entries) {
        const opens = (e.body.match(/[{(]/g) || []).length;
        const closes = (e.body.match(/[})]/g) || []).length;
        if (e.body.length < max * 0.05 && e.body.length < 100 && opens > closes) {
          bad.push(e.id);
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it("keeps the full mailOptions object, including cc/bcc, for use-cc-bcc's NodeJS sample", () => {
    const page = chunks.filter(
      (c) => c.url === "https://docs.liara.ir/email-server/how-tos/use-cc-bcc",
    );
    const nodejs = page.find((c) => c.platform === "NodeJS" && c.code.length > 0);
    expect(nodejs).toBeTruthy();
    const body = nodejs.code[0].body;
    expect(body).toContain("const mailOptions");
    expect(body).toContain('cc: ["example.one@example.com", "example.two@example.com"]');
    expect(body).toContain("bcc:");
    expect(body).toContain("subject:");
    expect(body.length).toBeGreaterThan(300);
  });

  it("never leaks the raw `desc:` key from an erased .map() card-grid literal", () => {
    // General shape: erasing a `{[{title, icon, desc, link}, ...].map(...)}`
    // decorative render must not leave its object-literal syntax behind as
    // prose anywhere in the index — this is the same class of bug as the
    // other object-key debris checks above, scoped to the key that carries
    // the harvested-prose feature (see next test).
    const bad = chunks.filter((c) => /\bdesc:/.test(c.text));
    expect(bad.map((c) => c.id).slice(0, 5)).toEqual([]);
  });

  it("harvests prose values (e.g. desc:) out of an erased card-grid .map() array instead of dropping them", () => {
    // dbaas/details/about's feature grid is `{[{title, icon, desc, link},
    // ...].map(...)}` — decorative syntax that must be erased, but the
    // `desc:` string it carried ("امکان ارتباط امن و سریع بین برنامه‌ها و
    // دیتابیس‌های مرتبط بدون محدودیت", describing the private-network
    // feature) is genuine prose and must survive as plain text, not vanish
    // along with the syntax around it.
    const page = chunks.filter(
      (c) => c.url === "https://docs.liara.ir/dbaas/details/about",
    );
    const hasDesc = page.some((c) =>
      c.text.includes(
        "امکان ارتباط امن و سریع بین برنامه‌ها و دیتابیس‌های مرتبط بدون محدودیت",
      ),
    );
    expect(hasDesc).toBe(true);
  });

  it("strips title boilerplate", () => {
    const bad = chunks.filter((c) => / - لیارا$/.test(c.pageTitle));
    expect(bad.map((c) => c.pageTitle).slice(0, 5)).toEqual([]);
  });

  it("gives every chunk non-empty text", () => {
    expect(chunks.filter((c) => !c.text.trim()).length).toBe(0);
  });

  it("indexes the liara.json reference page", () => {
    expect(chunks.some((c) => c.url === "https://docs.liara.ir/paas/liarajson")).toBe(true);
  });
});
