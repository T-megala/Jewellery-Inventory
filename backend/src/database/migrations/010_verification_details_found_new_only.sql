DELETE FROM stock_verification_details WHERE status = 'MISSING';

CREATE UNIQUE INDEX uk_verification_tag ON stock_verification_details (verification_id, tag_no);
