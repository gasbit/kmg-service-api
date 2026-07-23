ALTER TABLE "transaction_items"
ADD COLUMN "source_loan_id" BIGINT;

CREATE INDEX "transaction_items_source_loan_id_idx"
ON "transaction_items"("source_loan_id");

ALTER TABLE "transaction_items"
ADD CONSTRAINT "transaction_items_source_loan_id_fkey"
FOREIGN KEY ("source_loan_id")
REFERENCES "cylinder_loans"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
