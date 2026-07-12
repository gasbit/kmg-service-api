import type { Response } from "express";

export function sendSuccess<T>(response: Response, data: T, statusCode = 200): void {
  response.status(statusCode).json({
    success: true,
    data,
    meta: { requestId: response.locals.requestId as string }
  });
}
