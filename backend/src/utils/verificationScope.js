export const ALL_SCOPE_ID = -1;

export const SCOPE_NAMES = {
  ALL_PRODUCTS: "All Products",
  ALL_SUB_PRODUCTS: "All Sub Products",
  ALL_CENTERS: "All Centers",
};

const normalizeName = (value) => String(value ?? "").trim();

/** Normalize tag for inventory comparison and storage */
export const normalizeTag = (value) => normalizeName(value).toUpperCase();

export const TAG_EXPR = "UPPER(TRIM(tag_packet_no))";

const matchesScopeName = (name, scopeName) =>
  normalizeName(name).toLowerCase() === scopeName.toLowerCase();

export const isAllProducts = (item) => {
  if (!item) {
    return false;
  }

  return (
    Number(item.id) === ALL_SCOPE_ID ||
    matchesScopeName(item.name, SCOPE_NAMES.ALL_PRODUCTS)
  );
};

export const isAllSubProducts = (item) => {
  if (!item) {
    return false;
  }

  return (
    Number(item.id) === ALL_SCOPE_ID ||
    matchesScopeName(item.name, SCOPE_NAMES.ALL_SUB_PRODUCTS)
  );
};

export const isAllCenters = (item) => {
  if (!item) {
    return false;
  }

  return (
    Number(item.id) === ALL_SCOPE_ID ||
    matchesScopeName(item.name, SCOPE_NAMES.ALL_CENTERS)
  );
};

export const isAllProductsByName = (name) =>
  matchesScopeName(name, SCOPE_NAMES.ALL_PRODUCTS);

export const isAllSubProductsByName = (name) =>
  matchesScopeName(name, SCOPE_NAMES.ALL_SUB_PRODUCTS);

export const isAllCentersByName = (name) =>
  matchesScopeName(name, SCOPE_NAMES.ALL_CENTERS);

const scopeItemFromStoredName = (name, isAllFn) =>
  isAllFn(name) ? { id: ALL_SCOPE_ID, name } : { name };

export const buildInventoryScopeFilterFromStoredLabels = (
  activeBatchId,
  productName,
  subProductName,
  centerName,
) =>
  buildInventoryScopeFilter(
    activeBatchId,
    scopeItemFromStoredName(productName, isAllProductsByName),
    scopeItemFromStoredName(subProductName, isAllSubProductsByName),
    scopeItemFromStoredName(centerName, isAllCentersByName),
  );

export const resolveStoredScope = (product, subProduct, center) => ({
  productName: isAllProducts(product)
    ? SCOPE_NAMES.ALL_PRODUCTS
    : normalizeName(product.name),
  subProductName:
    !subProduct || isAllSubProducts(subProduct)
      ? SCOPE_NAMES.ALL_SUB_PRODUCTS
      : normalizeName(subProduct.name),
  centerName:
    !center || isAllCenters(center)
      ? SCOPE_NAMES.ALL_CENTERS
      : normalizeName(center.name),
});

const buildInventoryScopeConditions = (
  activeBatchId,
  product,
  subProduct,
  center,
) => {
  const conditions = ["tag_packet_no IS NOT NULL", `TRIM(tag_packet_no) != ''`];
  const params = [];

  if (isAllProducts(product)) {
    // Full-inventory scope: compare against all product rows (per business spec).
  } else if (activeBatchId) {
    // Scoped verification: active batch plus legacy rows not yet linked to a batch.
    conditions.push("(batch_id = ? OR batch_id IS NULL)");
    params.push(activeBatchId);
  } else {
    conditions.push("batch_id IS NULL");
  }

  if (!isAllProducts(product)) {
    conditions.push("product = ?");
    params.push(normalizeName(product.name));
  }

  if (subProduct && !isAllSubProducts(subProduct)) {
    conditions.push("sub_product = ?");
    params.push(normalizeName(subProduct.name));
  }

  if (center && !isAllCenters(center)) {
    conditions.push("counter_name = ?");
    params.push(normalizeName(center.name));
  }

  return { conditions, params };
};

export const buildInventoryScopeFilter = (
  activeBatchId,
  product,
  subProduct,
  center,
) => {
  const { conditions, params } = buildInventoryScopeConditions(
    activeBatchId,
    product,
    subProduct,
    center,
  );

  return {
    whereClause: conditions.join(" AND "),
    params,
  };
};

/** @deprecated Use buildInventoryScopeFilter for large inventories */
export const buildExpectedTagsQuery = (
  activeBatchId,
  product,
  subProduct,
  center,
) => {
  const { whereClause, params } = buildInventoryScopeFilter(
    activeBatchId,
    product,
    subProduct,
    center,
  );

  return {
    sql: `SELECT DISTINCT tag_packet_no FROM products WHERE ${whereClause}`,
    params,
  };
};
