export type CodeBlock = {
  lang: string;
  body: string;
};

export type Chunk = {
  /** Stable identifier: url plus section and part index. */
  id: string;
  /** Public docs.liara.ir URL derived from the source file path. */
  url: string;
  pageTitle: string;
  sectionTitle: string | null;
  /** Tab label when the chunk came from a per-platform `<Tabs>` branch. */
  platform: string | null;
  text: string;
  code: CodeBlock[];
};

export type SearchHit = {
  chunk: Chunk;
  score: number;
};
