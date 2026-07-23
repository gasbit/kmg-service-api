import request from "supertest";
import { describe, expect, it } from "vitest";

import { app } from "../../app";

describe("loan routes", () => {
  it.each([
    ["get", "/api/loans"],
    ["get", "/api/loans/active"],
    ["get", "/api/loans/1"],
    ["post", "/api/loans/1/return"]
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
      .get("/api/loans")
      .set("Authorization", "Bearer invalid-token");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });
});
