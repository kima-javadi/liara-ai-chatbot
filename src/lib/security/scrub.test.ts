import { describe, it, expect } from "vitest";
import { scrub } from "./scrub";

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

  it("redacts PEM private key blocks", () => {
    const pem =
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\nabc123\n-----END RSA PRIVATE KEY-----";
    expect(scrub(pem)).toBe("[REDACTED]");
  });

  it("redacts values of secret-looking env assignments", () => {
    expect(scrub("API_KEY=supersecretvalue123")).toBe("API_KEY=[REDACTED]");
    expect(scrub("DB_PASSWORD=hunter2")).toBe("DB_PASSWORD=[REDACTED]");
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
