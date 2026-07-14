CREATE UNIQUE INDEX "uq_product_images_single_primary"
ON "product_images" ("product_id")
WHERE "is_primary" = true;
