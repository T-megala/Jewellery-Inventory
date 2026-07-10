const MONTHS = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

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

const normalizeDate = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toLocalDateString(value);
  }

  const str = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }

  const match = str.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/i);
  if (match) {
    const month = MONTHS[match[2].toLowerCase()];
    if (month) {
      return `${match[3]}-${month}-${pad(match[1])}`;
    }
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? str : toLocalDateString(parsed);
};

export const normalizeProductFields = (row) => ({
  tran_no: normalizeString(row.tran_no),
  tran_date: normalizeDate(row.tran_date),
  product: normalizeString(row.product),
  sub_product: normalizeString(row.sub_product),
  tag_packet_no: normalizeString(row.tag_packet_no),
  pieces: normalizeNumber(row.pieces),
  gross_wt: normalizeNumber(row.gross_wt),
  net_wt: normalizeNumber(row.net_wt),
  counter_name: normalizeString(row.counter_name),
  size: normalizeString(row.size),
  tag_type: normalizeString(row.tag_type),
  item_pieces: normalizeNumber(row.item_pieces),
  weight_gram: normalizeNumber(row.weight_gram),
  weight_carat: normalizeNumber(row.weight_carat),
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
    !fieldsEqual(left.tran_no, right.tran_no) ||
    !fieldsEqual(left.tran_date, right.tran_date) ||
    !fieldsEqual(left.product, right.product) ||
    !fieldsEqual(left.sub_product, right.sub_product) ||
    !fieldsEqual(left.pieces, right.pieces) ||
    !fieldsEqual(left.gross_wt, right.gross_wt) ||
    !fieldsEqual(left.net_wt, right.net_wt) ||
    !fieldsEqual(left.counter_name, right.counter_name) ||
    !fieldsEqual(left.size, right.size) ||
    !fieldsEqual(left.tag_type, right.tag_type) ||
    !fieldsEqual(left.item_pieces, right.item_pieces) ||
    !fieldsEqual(left.weight_gram, right.weight_gram) ||
    !fieldsEqual(left.weight_carat, right.weight_carat)
  );
};

export const getTodayDateString = () => {
  const now = new Date();
  return toLocalDateString(now);
};

export const formatCalendarDate = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
  }

  return normalizeDate(value);
};

export { toLocalDateString, normalizeDate, formatCalendarDate as formatDateOnly };
