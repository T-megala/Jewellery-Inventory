-- Max making charge for tag printing (JewelTrack MaxMC export column).

ALTER TABLE product_pricing ADD COLUMN max_mc DECIMAL(14, 2) NULL;
