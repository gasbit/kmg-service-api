import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { login, me } from "./auth.controller";
import { loginSchema } from "./auth.schema";

export const authRoutes = Router();

authRoutes.post("/login", validate(loginSchema), login);
authRoutes.get("/me", authMiddleware, me);
