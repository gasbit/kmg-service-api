import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../shared/errors/app-error";
import { ERROR_CODES } from "../../shared/errors/error-codes";
import { sendSuccess } from "../../shared/utils/api-response";
import type { LoginInput } from "./auth.schema";
import { AuthService } from "./auth.service";

const authService = new AuthService();

export async function login(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(response, await authService.login(request.body as LoginInput));
  } catch (error) {
    next(error);
  }
}

export function getCurrentUser(request: Request, response: Response, next: NextFunction): void {
  if (!request.user) {
    next(new AppError(401, ERROR_CODES.UNAUTHORIZED, "Authentication required"));
    return;
  }
  sendSuccess(response, { user: request.user });
}
