-- MaxWastage is stored as grams (e.g. 8.905); keep 3 decimal places like other weights.

ALTER TABLE product_pricing
  MODIFY COLUMN wastage_amount DECIMAL(14, 3) NULL;
