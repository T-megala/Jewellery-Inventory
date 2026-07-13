import "dotenv/config";
import pool from "../src/config/database.js";

const statements = [
  "ALTER TABLE product_pricing ADD COLUMN sale_value DECIMAL(18, 2) NULL",
  "ALTER TABLE product_pricing ADD COLUMN rate DECIMAL(18, 2) NULL",
  "ALTER TABLE product_pricing ADD COLUMN rate_id DECIMAL(18, 2) NULL",
  "ALTER TABLE product_pricing ADD COLUMN per_pcs_value DECIMAL(18, 2) NULL",
  "ALTER TABLE product_pricing ADD COLUMN per_gram_value DECIMAL(18, 2) NULL",
  "ALTER TABLE product_pricing ADD COLUMN max_mc DECIMAL(14, 2) NULL",
];

for (const statement of statements) {
  try {
    await pool.query(statement);
    process.stdout.write(`OK: ${statement}\n`);
  } catch (error) {
    if (error.code === "ER_DUP_FIELDNAME") {
      process.stdout.write(`SKIP (exists): ${statement}\n`);
      continue;
    }

    throw error;
  }
}

const [columns] = await pool.query(
  `SHOW COLUMNS FROM product_pricing
   WHERE Field IN ('sale_value', 'rate', 'rate_id', 'per_pcs_value', 'per_gram_value', 'max_mc')`,
);

process.stdout.write(
  `Verified columns: ${columns.map((column) => column.Field).join(", ")}\n`,
);

await pool.end();
