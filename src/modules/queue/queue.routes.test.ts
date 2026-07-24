import request from "supertest";
import { describe, expect, it } from "vitest";

import { app } from "../../app";

describe("queue routes", () => {
  it.each([
    ["get", "/api/queues/today"],
    ["get", "/api/queues?date=2026-07-24"],
    ["patch", "/api/queues/1/status"]
  ] as const)("protects %s %s with bearer authentication", async (method, path) => {
    const response = await request(app)[method](path);
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: "UNAUTHORIZED" },
      meta: { requestId: expect.any(String) }
    });
  });

  it("rejects an invalid bearer token", async () => {
    const response = await request(app)
      .get("/api/queues/today")
      .set("Authorization", "Bearer invalid-token");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });
});
