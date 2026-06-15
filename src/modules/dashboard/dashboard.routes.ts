import { Router } from "express";
import { ROLE_CODES } from "../../constants/role.constants";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { roleMiddleware } from "../../middlewares/role.middleware";
import { getTodayDashboard } from "./dashboard.controller";

export const dashboardRoutes = Router();

dashboardRoutes.use(authMiddleware, roleMiddleware([ROLE_CODES.ADMIN]));
dashboardRoutes.get("/today", getTodayDashboard);
