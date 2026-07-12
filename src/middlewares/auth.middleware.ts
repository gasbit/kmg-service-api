import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

import { env } from "../config/env";
import { AuthService } from "../modules/auth/auth.service";
import { AppError } from "../shared/errors/app-error";
import { ERROR_CODES } from "../shared/errors/error-codes";

const authService = new AuthService();

export async function authMiddleware(request: Request, _response: Response, next: NextFunction): Promise<void> {
  try {
    const authorization = request.header("authorization");
    const [scheme, token, ...rest] = authorization?.split(" ") ?? [];

    if (scheme !== "Bearer" || !token || rest.length > 0) {
      throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Authentication required");
    }

    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    if (typeof payload.sub !== "string") {
      throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Authentication required");
    }

    request.user = await authService.getActiveUserById(payload.sub);
    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }
    next(new AppError(401, ERROR_CODES.UNAUTHORIZED, "Authentication required"));
  }
}
