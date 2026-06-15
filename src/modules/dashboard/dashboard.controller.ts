import type { Request, Response } from "express";
import { sendSuccess } from "../../shared/utils/response.util";
import { DashboardService } from "./dashboard.service";

const dashboardService = new DashboardService();

export async function getTodayDashboard(_req: Request, res: Response) {
  return sendSuccess(res, await dashboardService.today());
}
