-- Print rate fields on product_pricing (tag printing only; not used by stock verification).

ALTER TABLE product_pricing ADD COLUMN sale_value DECIMAL(18, 2) NULL;

ALTER TABLE product_pricing ADD COLUMN rate DECIMAL(18, 2) NULL;

ALTER TABLE product_pricing ADD COLUMN rate_id DECIMAL(18, 2) NULL;

ALTER TABLE product_pricing ADD COLUMN per_pcs_value DECIMAL(18, 2) NULL;

ALTER TABLE product_pricing ADD COLUMN per_gram_value DECIMAL(18, 2) NULL;
