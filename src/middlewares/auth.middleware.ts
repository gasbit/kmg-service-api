import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AppError } from "../shared/errors/AppError";
import { ERROR_CODES } from "../shared/errors/error-codes";
import type { AuthUser } from "../shared/types/auth-user.type";

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.header("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

  if (!token) {
    throw new AppError(ERROR_CODES.UNAUTHORIZED, "Authentication token is required", 401);
  }

  try {
    req.user = jwt.verify(token, env.JWT_SECRET) as AuthUser;
    next();
  } catch {
    throw new AppError(ERROR_CODES.UNAUTHORIZED, "Invalid authentication token", 401);
  }
}
