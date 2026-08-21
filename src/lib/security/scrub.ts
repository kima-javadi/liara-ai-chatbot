/**
 * Redacts secrets from user text before it reaches the model provider.
 *
 * This runs server-side on the request path, not at render time. Nothing is
 * persisted anywhere, so keeping secrets out of the outbound provider request
 * is this function's entire job.
 *
 * Order matters: PEM blocks are matched before anything else, because their
 * base64 payload can otherwise trip the generic token patterns and leave a
 * partially-redacted key behind.
 */

const REDACTED = "[REDACTED]";

const PATTERNS: Array<[RegExp, string]> = [
  // PEM private key blocks, including the BEGIN/END lines.
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, REDACTED],

  // Fallback for a truncated PEM paste missing its END marker: redact
  // everything from BEGIN onward rather than letting the key body through.
  // Must run after the complete-block pattern above, so a well-formed key
  // embedded in other text doesn't swallow the trailing text.
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*/g, REDACTED],

  // Provider API keys: sk-, rk-, ghp_, gho_, xoxb-, AKIA...
  [/\b(?:sk|rk)-[A-Za-z0-9_-]{16,}/g, REDACTED],
  [/\bgh[pousr]_[A-Za-z0-9]{16,}/g, REDACTED],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/g, REDACTED],
  [/\bAKIA[0-9A-Z]{16}\b/g, REDACTED],

  // Bearer tokens: keep the scheme so the shape of the log stays readable.
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, `Bearer ${REDACTED}`],

  // Password inside a connection string: scheme://user:PASSWORD@host
  // The password itself may contain '@' characters, so the value is matched
  // greedily up to the LAST '@' that precedes the host, not the first one.
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s]*(@[^\s@/]+)/gi, `$1${REDACTED}$2`],

  // Secret-looking environment assignments. The key name is preserved; only
  // the value is replaced, so the user can still see which variable it was.
  // Three case-explicit patterns instead of one case-insensitive pattern:
  // a naive /i flag would also redact ordinary words like "monkey" or
  // "turkey" that merely contain "key" as a substring.
  [
    /\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)[A-Z0-9_]*)\s*=\s*("[^"]*"|'[^']*'|\S+)/g,
    `$1=${REDACTED}`,
  ],
  [
    /\b((?:[a-z0-9]+_)*(?:key|token|secret|password|passwd|credential))\s*=\s*("[^"]*"|'[^']*'|\S+)/g,
    `$1=${REDACTED}`,
  ],
  [
    /\b([a-z][a-zA-Z0-9]*(?:Key|Token|Secret|Password|Passwd|Credential)[a-zA-Z0-9]*)\s*=\s*("[^"]*"|'[^']*'|\S+)/g,
    `$1=${REDACTED}`,
  ],
];

export function scrub(text: string): string {
  let out = text;
  for (const [re, replacement] of PATTERNS) {
    out = out.replace(re, replacement);
  }
  return out;
}

/**
 * Redacts every string a message part carries, at any depth.
 *
 * `text` is not the only part type that reaches the provider:
 * `convertToModelMessages` also forwards `file` parts (whose `url` can be a
 * `data:` payload) and `reasoning` parts, so scrubbing only `text` left a
 * literal hole in the "nothing unscrubbed reaches the LLM" guarantee.
 *
 * Structural keys are left alone — they are protocol identifiers, never user
 * prose, and rewriting them would corrupt the part rather than protect it.
 * Nothing is dropped: an unknown part type still reaches the model, just with
 * its strings redacted.
 */
const STRUCTURAL_KEYS = new Set([
  "type",
  "state",
  "mediaType",
  "sourceId",
  "toolCallId",
  "toolName",
  "providerMetadata",
  "callProviderMetadata",
]);

/**
 * Recursion ceiling.
 *
 * The walk follows attacker-shaped JSON: a body well inside the route's size
 * cap can still nest tens of thousands of arrays deep, which overflowed the
 * stack and turned a scrub into an unhandled 500. A legitimate UIMessage part
 * nests a handful of levels, so anything past this depth is not real content.
 *
 * Over-depth values are REPLACED, never passed through. Returning the value
 * unscrubbed would hand an attacker a way to smuggle a secret past the
 * scrubber by burying it deep enough, which is the whole thing this module
 * exists to prevent.
 */
const MAX_DEPTH = 64;
const TOO_DEEP = "[REDACTED]";

function scrubDeep(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return TOO_DEEP;
  if (typeof value === "string") return scrub(value);
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        STRUCTURAL_KEYS.has(k) ? v : scrubDeep(v, depth + 1),
      ]),
    );
  }
  return value;
}

export function scrubParts<T>(parts: T[]): T[] {
  return parts.map((p) => scrubDeep(p) as T);
}
