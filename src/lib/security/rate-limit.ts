/**
 * In-memory sliding-window rate limiter, keyed by IP.
 *
 * Known and accepted limitation: state is per process, so the limit is per
 * instance and resets on deploy. That is adequate for a single-instance
 * hackathon deployment and is documented in the spec rather than hidden.
 *
 * `now` is injectable so the tests do not depend on wall-clock time, which
 * also keeps this module free of the impure calls the React Compiler lint
 * rejects elsewhere in the codebase.
 */

export const LIMIT = 20;
export const WINDOW_MS = 60_000;

const hits = new Map<string, number[]>();

export function checkRateLimit(
  ip: string,
  now: number = Date.now(),
): { allowed: boolean; retryAfter: number } {
  const cutoff = now - WINDOW_MS;
  const recent = (hits.get(ip) ?? []).filter((t) => t > cutoff);

  if (recent.length >= LIMIT) {
    hits.set(ip, recent);
    const retryAfter = Math.ceil((recent[0] + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfter: Math.max(1, retryAfter) };
  }

  recent.push(now);
  hits.set(ip, recent);

  // Opportunistic cleanup: without this the map grows once per unique IP for
  // the life of the process.
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (!times.some((t) => t > cutoff)) hits.delete(key);
    }
  }

  return { allowed: true, retryAfter: 0 };
}

/** Test-only. */
export function __resetRateLimit(): void {
  hits.clear();
}
