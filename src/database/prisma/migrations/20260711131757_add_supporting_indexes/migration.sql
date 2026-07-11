-- CreateIndex
CREATE INDEX "customers_phone_idx" ON "customers"("phone");

-- CreateIndex
CREATE INDEX "cylinder_loans_transaction_id_idx" ON "cylinder_loans"("transaction_id");

-- CreateIndex
CREATE INDEX "cylinder_loans_customer_id_idx" ON "cylinder_loans"("customer_id");

-- CreateIndex
CREATE INDEX "cylinder_loans_product_id_idx" ON "cylinder_loans"("product_id");

-- CreateIndex
CREATE INDEX "inventory_movements_transaction_id_idx" ON "inventory_movements"("transaction_id");

-- CreateIndex
CREATE INDEX "products_is_active_idx" ON "products"("is_active");

-- CreateIndex
CREATE INDEX "transaction_items_transaction_id_idx" ON "transaction_items"("transaction_id");

-- CreateIndex
CREATE INDEX "transaction_items_product_id_idx" ON "transaction_items"("product_id");

-- CreateIndex
CREATE INDEX "transaction_status_logs_transaction_id_changed_at_idx" ON "transaction_status_logs"("transaction_id", "changed_at");

-- CreateIndex
CREATE INDEX "transaction_status_logs_changed_by_idx" ON "transaction_status_logs"("changed_by");

-- CreateIndex
CREATE INDEX "transactions_customer_id_idx" ON "transactions"("customer_id");

-- CreateIndex
CREATE INDEX "transactions_created_by_idx" ON "transactions"("created_by");

-- CreateIndex
CREATE INDEX "users_role_id_idx" ON "users"("role_id");
