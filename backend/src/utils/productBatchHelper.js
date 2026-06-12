const pad = (value) => String(value).padStart(2, '0');

const toLocalDateString = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const normalizeString = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
};

const normalizeNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const num = Number(value);
  if (!Number.isFinite(num)) {
    return null;
  }

  return Math.round(num * 1000) / 1000;
};

export const normalizeProductFields = (row) => ({
  barcode: normalizeString(row.barcode),
  item_description: normalizeString(row.item_description),
  closing_bal_qty: normalizeNumber(row.closing_bal_qty),
});

const fieldsEqual = (left, right) => {
  if (left === null && right === null) {
    return true;
  }

  if (left === null || right === null) {
    return false;
  }

  return left === right;
};

export const hasProductChanged = (existing, incoming) => {
  const left = normalizeProductFields(existing);
  const right = normalizeProductFields(incoming);

  return (
    !fieldsEqual(left.item_description, right.item_description) ||
    !fieldsEqual(left.closing_bal_qty, right.closing_bal_qty)
  );
};

export const getTodayDateString = () => {
  const now = new Date();
  return toLocalDateString(now);
};

export { toLocalDateString };
