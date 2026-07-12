import type { ErrorRequestHandler, RequestHandler } from "express";

import { AppError } from "../shared/errors/app-error";
import { ERROR_CODES } from "../shared/errors/error-codes";

export const notFoundMiddleware: RequestHandler = (_request, _response, next) => {
  next(new AppError(404, ERROR_CODES.NOT_FOUND, "Route not found"));
};

export const errorMiddleware: ErrorRequestHandler = (error, _request, response, _next) => {
  const operationalError = error instanceof AppError
    ? error
    : new AppError(500, ERROR_CODES.INTERNAL_ERROR, "Internal server error");

  response.status(operationalError.statusCode).json({
    success: false,
    error: {
      code: operationalError.code,
      message: operationalError.message,
      details: operationalError.details
    },
    meta: { requestId: response.locals.requestId as string }
  });
};
