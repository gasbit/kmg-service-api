import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

export function requestIdMiddleware(request: Request, response: Response, next: NextFunction): void {
  const incomingRequestId = request.header("x-request-id");
  const requestId = incomingRequestId && incomingRequestId.length <= 200
    ? incomingRequestId
    : `req_${randomUUID().replaceAll("-", "")}`;

  response.locals.requestId = requestId;
  response.setHeader("x-request-id", requestId);
  next();
}
