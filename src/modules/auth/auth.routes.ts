import { Router } from "express";

import { authMiddleware } from "../../middlewares/auth.middleware";
import { validateBody } from "../../middlewares/validate.middleware";
import { getCurrentUser, login } from "./auth.controller";
import { loginSchema } from "./auth.schema";

export const authRouter = Router();

authRouter.post("/login", validateBody(loginSchema), login);
authRouter.get("/me", authMiddleware, getCurrentUser);
