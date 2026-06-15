import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../config/logger";
import { AppError } from "../shared/errors/AppError";
import { ERROR_CODES } from "../shared/errors/error-codes";

export function errorMiddleware(error: unknown, req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Invalid request payload",
        details: error.flatten()
      },
      meta: { requestId: req.id }
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      },
      meta: { requestId: req.id }
    });
  }

  logger.error({ err: error, requestId: req.id }, "Unexpected error");
  return res.status(500).json({
    success: false,
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Internal server error"
    },
    meta: { requestId: req.id }
  });
}
