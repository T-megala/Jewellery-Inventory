/** Rows with a non-empty tag number in a batch */
export const TAG_FILTER = `
  tag_packet_no IS NOT NULL
  AND TRIM(tag_packet_no) != ''
`;

/** Fast path: one row per tag when uk_batch_tag is enforced (post-import fix). */
export const batchProductsWhere = `
  batch_id = ?
  AND ${TAG_FILTER}
`;

export const batchProductsFrom = `
  FROM products
  WHERE ${batchProductsWhere}
`;

export default {
  TAG_FILTER,
  batchProductsWhere,
  batchProductsFrom,
};
