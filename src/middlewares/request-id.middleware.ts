import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  req.id = req.header("x-request-id") ?? `req_${randomUUID()}`;
  res.setHeader("x-request-id", req.id);
  next();
}
