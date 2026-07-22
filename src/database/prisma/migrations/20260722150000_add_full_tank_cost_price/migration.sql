-- Add the dedicated full-tank cost while preserving existing product records.
ALTER TABLE "products" ADD COLUMN "full_tank_cost_price" DECIMAL(12,2);

UPDATE "products"
SET "full_tank_cost_price" = "exchange_cost_price";

ALTER TABLE "products" ALTER COLUMN "full_tank_cost_price" SET NOT NULL;
