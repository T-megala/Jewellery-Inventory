export const REPORT_EXPORT_COLUMNS = [
  { key: "verificationDate", label: "Verification Date", width: 52, excelWidth: 20 },
  { key: "status", label: "Status", width: 34, excelWidth: 12, isStatus: true },
  { key: "barcode", label: "Barcode", width: 58, excelWidth: 16 },
  { key: "itemDescription", label: "Item Description", width: 64, excelWidth: 28 },
  {
    key: "closingBalQty",
    label: "Closing Bal.Qty",
    width: 36,
    excelWidth: 14,
    align: "right",
  },
];

export const EXCEL_EXPORT_COLUMNS = REPORT_EXPORT_COLUMNS;

export const scaleColumnsToWidth = (columns, maxWidth) => {
  const total = columns.reduce((sum, column) => sum + column.width, 0);

  if (total <= maxWidth) {
    return columns;
  }

  const scale = maxWidth / total;

  return columns.map((column) => ({
    ...column,
    width: Math.max(22, Math.floor(column.width * scale)),
  }));
};

const mapRowWithColumns = (row, columns) =>
  columns.map((column) => {
    const value = row[column.key];

    if (value === null || value === undefined) {
      return "";
    }

    return value;
  });

export const mapRowToExportValues = (row) =>
  mapRowWithColumns(row, REPORT_EXPORT_COLUMNS);

export const mapRowToExcelExportValues = (row) =>
  mapRowWithColumns(row, EXCEL_EXPORT_COLUMNS);

export const getStatusColumnIndex = () =>
  REPORT_EXPORT_COLUMNS.findIndex((column) => column.isStatus) + 1;

export const getExcelStatusColumnIndex = () =>
  EXCEL_EXPORT_COLUMNS.findIndex((column) => column.isStatus) + 1;
