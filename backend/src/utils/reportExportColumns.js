const EXCEL_ONLY_KEYS = new Set([
  "productId",
  "inventoryProduct",
  "inventorySubProduct",
  "inventoryTagPacketNo",
  "productCreatedAt",
  "createdAt",
]);

export const REPORT_EXPORT_COLUMNS = [
  { key: "verificationDate", label: "Verification Date", width: 52, excelWidth: 20 },
  { key: "status", label: "Status", width: 34, excelWidth: 12, isStatus: true },
  { key: "tagNo", label: "Tag No", width: 58, excelWidth: 16 },
  { key: "productName", label: "Product", width: 48, excelWidth: 22 },
  { key: "subProductName", label: "Sub Product", width: 48, excelWidth: 22 },
  { key: "centerName", label: "Center", width: 42, excelWidth: 18 },
  { key: "pieces", label: "Pieces", width: 30, excelWidth: 10, align: "right" },
  { key: "tranNo", label: "Tran No", width: 34, excelWidth: 12 },
  { key: "tranDate", label: "Tran Date", width: 42, excelWidth: 12 },
  { key: "grossWt", label: "Gross Wt", width: 34, excelWidth: 10, align: "right" },
  { key: "netWt", label: "Net Wt", width: 34, excelWidth: 10, align: "right" },
  {
    key: "inventoryCounterName",
    label: "Inventory Center",
    width: 42,
    excelWidth: 18,
  },
  { key: "size", label: "Size", width: 30, excelWidth: 10 },
  { key: "tagType", label: "Tag Type", width: 34, excelWidth: 12 },
  { key: "itemPieces", label: "Item Pieces", width: 34, excelWidth: 12, align: "right" },
  { key: "weightGram", label: "Weight (g)", width: 36, excelWidth: 12, align: "right" },
  { key: "weightCarat", label: "Weight (ct)", width: 36, excelWidth: 12, align: "right" },
  { key: "productId", label: "Product ID", width: 32, excelWidth: 12, align: "right" },
  {
    key: "inventoryProduct",
    label: "Inventory Product",
    width: 48,
    excelWidth: 22,
  },
  {
    key: "inventorySubProduct",
    label: "Inventory Sub Product",
    width: 48,
    excelWidth: 22,
  },
  {
    key: "inventoryTagPacketNo",
    label: "Inventory Tag",
    width: 58,
    excelWidth: 16,
  },
  {
    key: "productCreatedAt",
    label: "Product Created At",
    width: 52,
    excelWidth: 20,
  },
  { key: "createdAt", label: "Verified At", width: 52, excelWidth: 20 },
];

export const EXCEL_EXPORT_COLUMNS = REPORT_EXPORT_COLUMNS.filter(
  (column) => !EXCEL_ONLY_KEYS.has(column.key),
);

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
