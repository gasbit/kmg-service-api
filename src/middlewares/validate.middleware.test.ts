import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { listProductsQuerySchema } from "../modules/products/product.schema";
import { validateQuery } from "./validate.middleware";

const runValidation = (query: unknown) => {
  const request = {} as Request;
  Object.defineProperty(request, "query", {
    configurable: false,
    enumerable: true,
    get: () => query
  });

  const response = { locals: {} } as Response;
  const next = vi.fn() as unknown as NextFunction;

  validateQuery(listProductsQuerySchema)(request, response, next);

  return { next, response };
};

describe("validateQuery", () => {
  it("stores default query values without assigning to Express request.query", () => {
    const { next, response } = runValidation({});

    expect(next).toHaveBeenCalledWith();
    expect(response.locals.validatedQuery).toEqual({
      page: 1,
      limit: 20,
      includeInactive: false
    });
  });

  it.each([
    ["false", false],
    ["true", true]
  ])("coerces pagination and includeInactive=%s", (includeInactive, expected) => {
    const { next, response } = runValidation({ page: "2", limit: "10", includeInactive });

    expect(next).toHaveBeenCalledWith();
    expect(response.locals.validatedQuery).toEqual({
      page: 2,
      limit: 10,
      includeInactive: expected
    });
  });

  it("passes invalid query parameters to the error middleware", () => {
    const { next, response } = runValidation({ page: "0" });

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid query parameters"
    }));
    expect(response.locals).not.toHaveProperty("validatedQuery");
  });
});
