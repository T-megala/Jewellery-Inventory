CREATE INDEX idx_verification_date ON stock_verification (verification_date);

CREATE INDEX idx_verification_created_at ON stock_verification (created_at);

CREATE INDEX idx_sv_batch_id ON stock_verification (batch_id);

CREATE INDEX idx_verification_id ON stock_verification_details (verification_id);

CREATE INDEX idx_status ON stock_verification_details (status);

CREATE INDEX idx_tag_no ON stock_verification_details (tag_no);

CREATE INDEX idx_svd_verification_status ON stock_verification_details (verification_id, status);
