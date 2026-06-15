import { endOfToday, startOfToday, toDateOnly } from "../../shared/utils/date.util";
import { DashboardRepository } from "./dashboard.repository";

export class DashboardService {
  constructor(private readonly dashboardRepository = new DashboardRepository()) {}

  async today() {
    const start = startOfToday();
    const end = endOfToday();
    const today = toDateOnly();

    const [statusSummary, todaySales, queue, productPrices, activeLoans, stockSummary] = await Promise.all([
      this.dashboardRepository.statusSummary(start, end),
      this.dashboardRepository.todaySales(start, end),
      this.dashboardRepository.todayQueue(today),
      this.dashboardRepository.activeProductPrices(),
      this.dashboardRepository.activeLoans(),
      this.dashboardRepository.stockSummary()
    ]);

    return {
      statusSummary: statusSummary.map((row) => ({ status: row.status, total: row._count.status })),
      todaySales: todaySales._sum.totalAmount ?? 0,
      queue,
      productPrices,
      activeLoans,
      stockSummary
    };
  }
}
