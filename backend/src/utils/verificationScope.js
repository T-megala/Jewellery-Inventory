export const ALL_SCOPE_ID = -1;

export const SCOPE_NAMES = {
  ALL_PRODUCTS: 'All Products',
  ALL_SUB_PRODUCTS: 'All Sub Products',
  ALL_CENTERS: 'All Centers',
};

const normalizeName = (value) => String(value ?? '').trim();

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

export const buildExpectedTagsQuery = (activeBatchId, product, subProduct, center) => {
  const conditions = [
    'batch_id = ?',
    'tag_packet_no IS NOT NULL',
    "TRIM(tag_packet_no) != ''",
  ];
  const params = [activeBatchId];

  if (!isAllProducts(product)) {
    conditions.push('product = ?');
    params.push(normalizeName(product.name));
  }

  if (subProduct && !isAllSubProducts(subProduct)) {
    conditions.push('sub_product = ?');
    params.push(normalizeName(subProduct.name));
  }

  if (center && !isAllCenters(center)) {
    conditions.push('counter_name = ?');
    params.push(normalizeName(center.name));
  }

  return {
    sql: `SELECT tag_packet_no FROM products WHERE ${conditions.join(' AND ')}`,
    params,
  };
};
