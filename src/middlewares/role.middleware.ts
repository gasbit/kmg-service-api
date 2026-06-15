import type { NextFunction, Request, Response } from "express";
import { AppError } from "../shared/errors/AppError";
import { ERROR_CODES } from "../shared/errors/error-codes";

export function roleMiddleware(allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, "Authentication is required", 401);
    }

    if (!allowedRoles.includes(req.user.roleCode)) {
      throw new AppError(ERROR_CODES.FORBIDDEN, "You do not have permission to access this resource", 403);
    }

    next();
  };
}
