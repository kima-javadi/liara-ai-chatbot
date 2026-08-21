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

  // Provider API keys: sk-, rk-, ghp_, gho_, xoxb-, AKIA...
  [/\b(?:sk|rk)-[A-Za-z0-9_-]{16,}/g, REDACTED],
  [/\bgh[pousr]_[A-Za-z0-9]{16,}/g, REDACTED],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/g, REDACTED],
  [/\bAKIA[0-9A-Z]{16}\b/g, REDACTED],

  // Bearer tokens: keep the scheme so the shape of the log stays readable.
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, `Bearer ${REDACTED}`],

  // Password inside a connection string: scheme://user:PASSWORD@host
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@]+(@)/gi, `$1${REDACTED}$2`],

  // Secret-looking environment assignments. The key name is preserved; only
  // the value is replaced, so the user can still see which variable it was.
  [
    /\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)[A-Z0-9_]*)\s*=\s*("[^"]*"|'[^']*'|\S+)/g,
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
