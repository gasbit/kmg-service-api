import request from "supertest";
import { describe, expect, it } from "vitest";

import { app } from "../../app";

describe("transaction routes", () => {
  it.each([
    ["get", "/api/transactions"],
    ["get", "/api/transactions/1"],
    ["post", "/api/transactions"],
    ["patch", "/api/transactions/1/status"],
    ["post", "/api/transactions/1/cancel"]
  ] as const)("protects %s %s with bearer authentication", async (method, path) => {
    const response = await request(app)[method](path);
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: "UNAUTHORIZED" },
      meta: { requestId: expect.any(String) }
    });
  });
});
