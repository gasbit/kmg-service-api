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
