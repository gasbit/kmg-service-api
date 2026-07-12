import type { NextFunction, Request, Response } from "express";

import { AppError } from "../shared/errors/app-error";
import { ERROR_CODES } from "../shared/errors/error-codes";

export function requireRoles(...allowedRoles: string[]) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    if (!request.user) {
      next(new AppError(401, ERROR_CODES.UNAUTHORIZED, "Authentication required"));
      return;
    }
    if (!allowedRoles.includes(request.user.role.code)) {
      next(new AppError(403, ERROR_CODES.FORBIDDEN, "Insufficient permissions"));
      return;
    }
    next();
  };
}
