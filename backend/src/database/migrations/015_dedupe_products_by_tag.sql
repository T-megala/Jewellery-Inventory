-- Remove duplicate (batch_id, tag) rows; keep the row with the highest id per trimmed tag.
DELETE FROM products
WHERE id NOT IN (
  SELECT keep_id FROM (
    SELECT MAX(id) AS keep_id
    FROM products
    WHERE tag_packet_no IS NOT NULL
      AND TRIM(tag_packet_no) != ''
    GROUP BY batch_id, TRIM(tag_packet_no)
  ) deduped
)
  AND tag_packet_no IS NOT NULL
  AND TRIM(tag_packet_no) != '';
