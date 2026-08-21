import { describe, it, expect } from "vitest";
import { convertToModelMessages } from "ai";
import { scrub, scrubParts } from "./scrub";

describe("scrub", () => {
  it("redacts OpenAI-style API keys", () => {
    expect(scrub("my key is sk-abc123DEF456ghi789JKL012mno345")).toBe(
      "my key is [REDACTED]",
    );
  });

  it("redacts bearer tokens but keeps the header name", () => {
    expect(scrub("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def")).toBe(
      "Authorization: Bearer [REDACTED]",
    );
  });

  it("redacts the password inside a database connection string", () => {
    expect(scrub("mysql://root:hunter2@db.liara.cloud:3306/mydb")).toBe(
      "mysql://root:[REDACTED]@db.liara.cloud:3306/mydb",
    );
  });

  it("redacts a connection-string password that itself contains '@' characters", () => {
    expect(
      scrub("mysql://root:p@ssw0rd@db.liara.cloud:3306/mydb"),
    ).toBe("mysql://root:[REDACTED]@db.liara.cloud:3306/mydb");
    expect(scrub("postgres://u:pa@ss@host:5432/db")).toBe(
      "postgres://u:[REDACTED]@host:5432/db",
    );
    expect(
      scrub("redis://default:a@b@c@redis.liara.cloud:6379"),
    ).toBe("redis://default:[REDACTED]@redis.liara.cloud:6379");
  });

  it("leaves a plain URL with no userinfo section untouched", () => {
    const text = "see https://docs.liara.ir/paas/liarajson for details";
    expect(scrub(text)).toBe(text);
  });

  it("redacts PEM private key blocks", () => {
    const pem =
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\nabc123\n-----END RSA PRIVATE KEY-----";
    expect(scrub(pem)).toBe("[REDACTED]");
  });

  it("redacts values of secret-looking env assignments", () => {
    expect(scrub("API_KEY=supersecretvalue123")).toBe("API_KEY=[REDACTED]");
    expect(scrub("DB_PASSWORD=hunter2")).toBe("DB_PASSWORD=[REDACTED]");
  });

  it("redacts lowercase, snake_case, and camelCase secret-looking assignments", () => {
    expect(scrub("password=hunter2")).toBe("password=[REDACTED]");
    expect(scrub("apiSecret=whsec_abc")).toBe("apiSecret=[REDACTED]");
    expect(scrub("dbToken=xyz")).toBe("dbToken=[REDACTED]");
    expect(scrub("db_password=x")).toBe("db_password=[REDACTED]");
  });

  it("does not redact ordinary words that merely contain a secret-like substring", () => {
    expect(scrub("monkey=banana")).toBe("monkey=banana");
    expect(scrub("turkey=3")).toBe("turkey=3");
    expect(scrub("keyboard=mechanical")).toBe("keyboard=mechanical");
    expect(scrub("donkey_ride=fun")).toBe("donkey_ride=fun");
  });

  it("fully redacts a truncated PEM paste missing its END marker", () => {
    const truncated =
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\nabc123";
    expect(scrub(truncated)).toBe("[REDACTED]");
  });

  it("leaves ordinary prose untouched", () => {
    const text = "چطور یک پروژه Next.js را روی لیارا دیپلوی کنم؟";
    expect(scrub(text)).toBe(text);
  });

  it("leaves ordinary code and non-secret env vars untouched", () => {
    const code = 'liara deploy --app my-app --port 3000\nPORT=3000\nNODE_ENV=production';
    expect(scrub(code)).toBe(code);
  });

  it("leaves an error log untouched", () => {
    const log = "npm ERR! cipm can only install packages when your package.json";
    expect(scrub(log)).toBe(log);
  });
});

/**
 * These assert against the artifact that actually leaves the process: the
 * output of the AI SDK's own `convertToModelMessages`. Each case first proves
 * the secret DOES survive conversion when the part is not scrubbed, so a
 * passing "after" is not a test of a fixture that never carried the secret.
 */
describe("scrubParts", () => {
  const SECRET = "AKIAIOSFODNN7EXAMPLE";

  async function modelJson(parts: unknown[]) {
    const converted = await convertToModelMessages([
      { id: "m1", role: "user", parts },
      { id: "m2", role: "assistant", parts: [{ type: "text", text: "ok" }] },
    ] as never);
    return JSON.stringify(converted);
  }

  it("redacts a data: URL carried by a file part", async () => {
    const part = {
      type: "file",
      mediaType: "text/plain",
      url: `data:text/plain,aws key ${SECRET}`,
    };
    expect(await modelJson([part])).toContain(SECRET);
    expect(await modelJson(scrubParts([part]))).not.toContain(SECRET);
  });

  it("redacts a reasoning part", async () => {
    const parts = [
      { type: "reasoning", text: `reasoning ${SECRET}` },
      { type: "text", text: "سلام" },
    ];
    const before = await convertToModelMessages([
      { id: "m1", role: "assistant", parts },
    ] as never);
    expect(JSON.stringify(before)).toContain(SECRET);
    const after = await convertToModelMessages([
      { id: "m1", role: "assistant", parts: scrubParts(parts) },
    ] as never);
    expect(JSON.stringify(after)).not.toContain(SECRET);
  });

  it("still redacts plain text parts", async () => {
    const part = { type: "text", text: `AWS_SECRET_ACCESS_KEY=${SECRET}` };
    expect(await modelJson([part])).toContain(SECRET);
    expect(await modelJson(scrubParts([part]))).not.toContain(SECRET);
  });

  it("keeps every part and every structural discriminant", () => {
    const parts = [
      { type: "text", text: "a" },
      { type: "file", mediaType: "text/plain", url: "data:text/plain,b" },
      { type: "reasoning", text: "c" },
      { type: "some-future-part", payload: { note: "d" } },
    ];
    const out = scrubParts(parts);
    expect(out).toHaveLength(4);
    expect(out.map((p) => p.type)).toEqual([
      "text",
      "file",
      "reasoning",
      "some-future-part",
    ]);
    expect(out[1].mediaType).toBe("text/plain");
  });
});
