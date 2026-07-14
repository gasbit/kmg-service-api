import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

import { AppError } from "../shared/errors/app-error";
import { ERROR_CODES } from "../shared/errors/error-codes";

export function validateBody(schema: ZodType) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const result = schema.safeParse(request.body);

    if (!result.success) {
      next(new AppError(400, ERROR_CODES.VALIDATION_ERROR, "Invalid request payload", result.error.issues));
      return;
    }

    request.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodType) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const result = schema.safeParse(request.query);
    if (!result.success) {
      next(new AppError(400, ERROR_CODES.VALIDATION_ERROR, "Invalid query parameters", result.error.issues));
      return;
    }
    response.locals.validatedQuery = result.data;
    next();
  };
}

export function validateParams(schema: ZodType) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const result = schema.safeParse(request.params);
    if (!result.success) {
      next(new AppError(400, ERROR_CODES.VALIDATION_ERROR, "Invalid path parameters", result.error.issues));
      return;
    }
    request.params = result.data;
    next();
  };
}
