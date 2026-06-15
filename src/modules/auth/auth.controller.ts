import type { Request, Response } from "express";
import { sendSuccess } from "../../shared/utils/response.util";
import { AuthService } from "./auth.service";

const authService = new AuthService();

export async function login(req: Request, res: Response) {
  const result = await authService.login(req.body);
  return sendSuccess(res, result);
}

export async function me(req: Request, res: Response) {
  const result = await authService.me(req.user!);
  return sendSuccess(res, result);
}
