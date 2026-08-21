import type { ReactNode } from "react";

/**
 * A deliberately small syntax highlighter.
 *
 * The corpus only ever produces a handful of languages (bash, json, js,
 * python, php dominate the docs), and pulling in a full highlighter costs
 * more bundle than it earns for a chat surface. This covers json and shell
 * properly and degrades to plain text for everything else.
 */

type Piece = { text: string; cls?: string };

function jsonPieces(src: string): Piece[] {
  const out: Piece[] = [];
  const re =
    /("(?:\\.|[^"\\])*")(\s*:)?|(\btrue\b|\bfalse\b|\bnull\b)|(-?\d+(?:\.\d+)?)|([{}[\],:])/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ text: src.slice(last, m.index) });
    if (m[1]) {
      // A quoted string followed by a colon is a key, otherwise a value.
      out.push({ text: m[1], cls: m[2] ? "tok-key" : "tok-str" });
      if (m[2]) out.push({ text: m[2], cls: "tok-punct" });
    } else if (m[3]) {
      out.push({ text: m[3], cls: "tok-bool" });
    } else if (m[4]) {
      out.push({ text: m[4], cls: "tok-num" });
    } else if (m[5]) {
      out.push({ text: m[5], cls: "tok-punct" });
    }
    last = re.lastIndex;
  }
  if (last < src.length) out.push({ text: src.slice(last) });
  return out;
}

function shellPieces(src: string): Piece[] {
  const out: Piece[] = [];

  src.split("\n").forEach((rawLine, idx) => {
    if (idx) out.push({ text: "\n" });

    if (rawLine.trimStart().startsWith("#")) {
      out.push({ text: rawLine, cls: "tok-comment" });
      return;
    }

    const re = /(\s+)|("[^"]*"|'[^']*')|(--?[\w-]+)|(\S+)/g;
    let m: RegExpExecArray | null;
    let firstWordSeen = false;

    while ((m = re.exec(rawLine))) {
      if (m[2]) out.push({ text: m[2], cls: "tok-str" });
      else if (m[3]) out.push({ text: m[3], cls: "tok-flag" });
      else if (m[4]) {
        out.push({ text: m[4], cls: firstWordSeen ? undefined : "tok-cmd" });
        firstWordSeen = true;
      } else out.push({ text: m[0] });
    }
  });

  return out;
}

export function highlight(code: string, lang?: string): ReactNode {
  const l = (lang || "").toLowerCase();

  let pieces: Piece[];
  if (l === "json") pieces = jsonPieces(code);
  else if (l === "bash" || l === "sh" || l === "shell" || l === "zsh")
    pieces = shellPieces(code);
  else return code;

  return pieces.map((p, i) =>
    p.cls ? (
      <span key={i} className={p.cls}>
        {p.text}
      </span>
    ) : (
      <span key={i}>{p.text}</span>
    ),
  );
}
