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
    // component's true boundary.
    const debrisPattern =
      /\bstep:\s*"|\bcontent:\s*\(|\blabel:\s*"|\blanguage:\s*"|\bicon:\s*,|\.map\(\(/;
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
