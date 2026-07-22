import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { createLogger } from "./logger";

describe("logger redaction", () => {
  it("redacts credentials and sensitive customer fields", () => {
    const output: string[] = [];
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output.push(chunk.toString());
        callback();
      },
    });
    const testLogger = createLogger(destination);

    testLogger.info({
      password: "admin-password",
      input: { token: "jwt-token", customerPhone: "0812345678" },
      req: {
        headers: { authorization: "Bearer jwt-token", cookie: "session=secret" },
        body: { customerName: "Customer", address: "Private address" },
      },
      safe: "visible",
    });

    const entry = JSON.parse(output[0]) as Record<string, unknown>;
    expect(JSON.stringify(entry)).not.toContain("admin-password");
    expect(JSON.stringify(entry)).not.toContain("jwt-token");
    expect(JSON.stringify(entry)).not.toContain("session=secret");
    expect(JSON.stringify(entry)).not.toContain("0812345678");
    expect(JSON.stringify(entry)).not.toContain("Customer");
    expect(JSON.stringify(entry)).not.toContain("Private address");
    expect(entry.safe).toBe("visible");
  });
});
