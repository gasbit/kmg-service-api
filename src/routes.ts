import { Router } from "express";
import { authRoutes } from "./modules/auth/auth.routes";
import { dashboardRoutes } from "./modules/dashboard/dashboard.routes";
import { inventoryRoutes } from "./modules/inventory/inventory.routes";
import { loanRoutes } from "./modules/loans/loan.routes";
import { productRoutes } from "./modules/products/product.routes";
import { queueRoutes } from "./modules/queue/queue.routes";
import { transactionRoutes } from "./modules/transactions/transaction.routes";

export const v1Routes = Router();

v1Routes.use("/auth", authRoutes);
v1Routes.use("/products", productRoutes);
v1Routes.use("/transactions", transactionRoutes);
v1Routes.use("/queues", queueRoutes);
v1Routes.use("/loans", loanRoutes);
v1Routes.use("/inventory", inventoryRoutes);
v1Routes.use("/dashboard", dashboardRoutes);
