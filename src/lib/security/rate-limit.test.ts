import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, __resetRateLimit, LIMIT, WINDOW_MS } from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => __resetRateLimit());

  it("allows requests up to the limit", () => {
    for (let i = 0; i < LIMIT; i++) {
      expect(checkRateLimit("1.1.1.1", 1000).allowed).toBe(true);
    }
  });

  it("blocks the request after the limit", () => {
    for (let i = 0; i < LIMIT; i++) checkRateLimit("1.1.1.1", 1000);
    const result = checkRateLimit("1.1.1.1", 1000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("tracks each IP separately", () => {
    for (let i = 0; i < LIMIT; i++) checkRateLimit("1.1.1.1", 1000);
    expect(checkRateLimit("2.2.2.2", 1000).allowed).toBe(true);
  });

  it("allows again once the window has slid past", () => {
    for (let i = 0; i < LIMIT; i++) checkRateLimit("1.1.1.1", 1000);
    expect(checkRateLimit("1.1.1.1", 1000).allowed).toBe(false);
    expect(checkRateLimit("1.1.1.1", 1000 + WINDOW_MS + 1).allowed).toBe(true);
  });

  it("slides rather than resetting in fixed buckets", () => {
    // Fill the window with timestamps spread across it.
    for (let i = 0; i < LIMIT; i++) checkRateLimit("1.1.1.1", 1000 + i * 10);
    // Just past the first entry's expiry, exactly one slot frees up.
    const t = 1000 + WINDOW_MS + 1;
    expect(checkRateLimit("1.1.1.1", t).allowed).toBe(true);
    expect(checkRateLimit("1.1.1.1", t).allowed).toBe(false);
  });
});
