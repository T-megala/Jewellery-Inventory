import { Readable } from "node:stream";
import ExcelJS from "exceljs";

const DEBUG = process.env.EXCEL_PARSE_DEBUG !== "false";
const STREAMING_THRESHOLD_BYTES = Number.parseInt(
  process.env.EXCEL_STREAMING_THRESHOLD_BYTES ?? `${1024 * 1024}`,
  10,
);

const EXCELJS_LOAD_OPTIONS = {
  ignoreNodes: [
    "drawing",
    "picture",
    "extLst",
    "conditionalFormatting",
    "dataValidations",
    "sheetProtection",
    "printOptions",
    "pageSetup",
    "headerFooter",
    "mergeCells",
    "autoFilter",
  ],
};

const STREAM_READER_OPTIONS = {
  sharedStrings: "cache",
  hyperlinks: "ignore",
  styles: "ignore",
  worksheets: "emit",
};

const logExcel = (message, meta = undefined) => {
  if (!DEBUG) {
    return;
  }

  if (meta === undefined) {
    console.info(`[excel-parser] ${message}`);
    return;
  }

  console.info(`[excel-parser] ${message}`, meta);
};

const REQUIRED_COLUMNS = ["barcode", "itemDescription", "closingBalQty"];

const normalizeHeader = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

const normalizeCellValue = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "object") {
    if (value.result !== undefined && value.result !== null) {
      return value.result;
    }

    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }

    if (value.text !== undefined) {
      return value.text;
    }
  }

  return value;
};

const normalizeExcelBuffer = (buffer) => {
  if (!buffer) {
    throw new Error("Excel file buffer is empty");
  }

  if (Buffer.isBuffer(buffer)) {
    return buffer;
  }

  if (buffer instanceof ArrayBuffer) {
    return Buffer.from(buffer);
  }

  if (ArrayBuffer.isView(buffer)) {
    return Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }

  return Buffer.from(buffer);
};

const isXlsxBuffer = (buffer) =>
  buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;

const isLegacyXlsBuffer = (buffer) =>
  buffer.length >= 4 &&
  buffer[0] === 0xd0 &&
  buffer[1] === 0xcf &&
  buffer[2] === 0x11 &&
  buffer[3] === 0xe0;

const rowValuesToArray = (rowValues, maxCol) => {
  const limit = Math.max(maxCol, Array.isArray(rowValues) ? rowValues.length - 1 : 0, 1);

  return Array.from({ length: limit }, (_, index) =>
    normalizeCellValue(rowValues?.[index + 1]),
  );
};

const logWorkbookSummary = (workbook, source) => {
  if (!workbook) {
    logExcel("workbook summary missing workbook", { source });
    return;
  }

  const worksheets = workbook.worksheets ?? [];

  logExcel("Workbook loaded successfully", { source });
  logExcel("Worksheet count", { source, count: worksheets.length });
  logExcel("workbook metadata", {
    source,
    worksheetCount: worksheets.length,
    worksheetNames: worksheets.map((sheet) => sheet.name),
    worksheets: worksheets.map((sheet) => ({
      name: sheet.name,
      rowCount: sheet.rowCount,
      columnCount: sheet.columnCount,
      actualColumnCount: sheet.actualColumnCount,
      state: sheet.state,
    })),
  });
};

const assertWorkbookReady = (workbook) => {
  if (!workbook) {
    throw new Error("Workbook not loaded");
  }

  if (!Array.isArray(workbook.worksheets) || workbook.worksheets.length === 0) {
    throw new Error("No worksheets found in Excel file");
  }
};

const loadWorkbookWithExcelJS = async (buffer) => {
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(buffer, EXCELJS_LOAD_OPTIONS);
  } catch (error) {
    logExcel("Excel workbook load failed", {
      error: error.message,
      stack: error.stack,
    });
    throw new Error(`Could not read Excel file: ${error.message}`);
  }

  assertWorkbookReady(workbook);
  logWorkbookSummary(workbook, "exceljs-load");

  return workbook;
};

const worksheetToRows = (worksheet) => {
  if (!worksheet || worksheet.rowCount === 0) {
    return [];
  }

  const maxCol = Math.max(
    worksheet.columnCount || 0,
    worksheet.actualColumnCount || 0,
    1,
  );
  const rows = [];

  worksheet.eachRow({ includeEmpty: true }, (row) => {
    rows.push(rowValuesToArray(row.values, maxCol));
  });

  return rows;
};

const parseRowsToResult = (rows) => {
  const headerIndex = findHeaderRowIndex(rows);

  if (headerIndex === -1) {
    throw new Error("Header row with Barcode was not found in the Excel file");
  }

  const columnMap = buildColumnMap(rows[headerIndex]);
  for (const column of REQUIRED_COLUMNS) {
    if (columnMap[column] === undefined) {
      throw new Error(`Required column "${column}" was not found in the Excel file`);
    }
  }

  const dataRows = rows.slice(headerIndex + 1);
  const validRows = [];
  let skipped = 0;

  for (const rawRow of dataRows) {
    const row = mapRawRow(rawRow, columnMap);

    if (isGroupHeaderRow(row)) {
      skipped += 1;
      continue;
    }

    if (!isDataRow(row)) {
      skipped += 1;
      continue;
    }

    validRows.push(toDbRow(row));
  }

  return {
    validRows,
    totalRowsInFile: dataRows.length,
    skipped,
  };
};

const parseWithExcelJSStreaming = async (buffer) => {
  const startedAt = Date.now();
  logExcel("streaming parse started", { bufferBytes: buffer.length });

  const reader = new ExcelJS.stream.xlsx.WorkbookReader(
    Readable.from(buffer),
    STREAM_READER_OPTIONS,
  );

  let columnMap = null;
  let maxCol = 1;
  const validRows = [];
  let skipped = 0;
  let totalRowsInFile = 0;
  let sheetHandled = false;

  for await (const worksheetReader of reader) {
    if (sheetHandled) {
      break;
    }

    logExcel("streaming worksheet opened", {
      id: worksheetReader.id,
      name: worksheetReader.name,
    });

    for await (const row of worksheetReader) {
      const rowValues = row.values ?? [];
      maxCol = Math.max(maxCol, rowValues.length - 1, row.cellCount || 0, 1);
      const rawRow = rowValuesToArray(rowValues, maxCol);

      if (!columnMap) {
        if (normalizeHeader(rawRow[0]) !== "barcode") {
          continue;
        }

        columnMap = buildColumnMap(rawRow);

        for (const column of REQUIRED_COLUMNS) {
          if (columnMap[column] === undefined) {
            throw new Error(
              `Required column "${column}" was not found in the Excel file`,
            );
          }
        }

        logExcel("header row found in stream", {
          rowNumber: row.number,
          columnMap,
        });
        continue;
      }

      totalRowsInFile += 1;
      const mappedRow = mapRawRow(rawRow, columnMap);

      if (isGroupHeaderRow(mappedRow)) {
        skipped += 1;
        continue;
      }

      if (!isDataRow(mappedRow)) {
        skipped += 1;
        continue;
      }

      validRows.push(toDbRow(mappedRow));
    }

    sheetHandled = true;
  }

  if (!columnMap) {
    throw new Error("Header row with Barcode was not found in the Excel file");
  }

  logExcel("streaming parse completed", {
    durationMs: Date.now() - startedAt,
    totalRowsInFile,
    validRows: validRows.length,
    skipped,
  });

  return {
    validRows,
    totalRowsInFile,
    skipped,
  };
};

const parseWithSheetJSFallback = async (buffer) => {
  const startedAt = Date.now();
  logExcel("sheetjs fallback parse started", { bufferBytes: buffer.length });

  const { default: XLSX } = await import("xlsx");
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    cellNF: false,
    cellStyles: false,
    sheetStubs: false,
  });

  const sheetName = workbook.SheetNames?.[0];

  if (!sheetName || !workbook.Sheets?.[sheetName]) {
    throw new Error("No worksheets found in Excel file");
  }

  logExcel("sheetjs workbook loaded", {
    worksheetCount: workbook.SheetNames.length,
    worksheetNames: workbook.SheetNames,
    activeSheet: sheetName,
  });

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const result = parseRowsToResult(rows);

  logExcel("sheetjs fallback parse completed", {
    durationMs: Date.now() - startedAt,
    totalRowsInFile: result.totalRowsInFile,
    validRows: result.validRows.length,
    skipped: result.skipped,
  });

  return result;
};

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const findHeaderRowIndex = (rows) =>
  rows.findIndex((row) => normalizeHeader(row[0]) === "barcode");

const buildColumnMap = (headers) => {
  const map = {};

  headers.forEach((header, index) => {
    const key = normalizeHeader(header);

    if (key === "barcode") map.barcode = index;
    else if (key === "itemdescription") map.itemDescription = index;
    else if (key === "closingbal.qty" || key === "closingbalqty") {
      map.closingBalQty = index;
    }
  });

  return map;
};

const getCell = (row, index) => {
  if (index === undefined || index === null) {
    return "";
  }
  return row[index] ?? "";
};

const isGroupHeaderRow = (row) => {
  const description = String(row.itemDescription ?? "").trim();
  const barcode = String(row.barcode ?? "").trim();

  return Boolean(description && !barcode);
};

const isDataRow = (row) => {
  const barcode = String(row.barcode ?? "").trim();
  const itemDescription = String(row.itemDescription ?? "").trim();

  return Boolean(barcode && itemDescription);
};

const mapRawRow = (rawRow, columnMap) => ({
  barcode: getCell(rawRow, columnMap.barcode),
  itemDescription: getCell(rawRow, columnMap.itemDescription),
  closingBalQty: getCell(rawRow, columnMap.closingBalQty),
});

const toDbRow = (row) => ({
  barcode: String(row.barcode).trim(),
  item_description: String(row.itemDescription).trim(),
  closing_bal_qty: toNumber(row.closingBalQty) ?? 0,
});

export const parseStockExcel = async (buffer) => {
  const fileBuffer = normalizeExcelBuffer(buffer);
  const startedAt = Date.now();

  if (fileBuffer.length === 0) {
    throw new Error("Excel file is empty");
  }

  if (isLegacyXlsBuffer(fileBuffer)) {
    throw new Error(
      "Invalid Excel file. Upload a valid .xlsx file (old .xls format is not supported)",
    );
  }

  if (!isXlsxBuffer(fileBuffer)) {
    throw new Error(
      "Invalid Excel file. Upload a valid .xlsx file exported from Excel",
    );
  }

  logExcel("parse started", {
    bufferBytes: fileBuffer.length,
    useStreaming: fileBuffer.length >= STREAMING_THRESHOLD_BYTES,
  });

  const attempts = [];

  if (fileBuffer.length >= STREAMING_THRESHOLD_BYTES) {
    attempts.push("exceljs-stream");
  } else {
    attempts.push("exceljs-load");
  }

  attempts.push("exceljs-stream", "sheetjs-fallback");

  let lastError = null;

  for (const strategy of [...new Set(attempts)]) {
    try {
      if (strategy === "exceljs-load") {
        const workbook = await loadWorkbookWithExcelJS(fileBuffer);
        const worksheet = workbook.worksheets[0] ?? workbook.getWorksheet(1);

        if (!worksheet) {
          throw new Error("Excel file does not contain any sheets");
        }

        logExcel("using worksheet", {
          name: worksheet.name,
          rowCount: worksheet.rowCount,
          columnCount: worksheet.columnCount,
        });

        const rows = worksheetToRows(worksheet);
        const result = parseRowsToResult(rows);

        logExcel("parse completed", {
          strategy,
          durationMs: Date.now() - startedAt,
          totalRowsInFile: result.totalRowsInFile,
          validRows: result.validRows.length,
          skipped: result.skipped,
        });

        return result;
      }

      if (strategy === "exceljs-stream") {
        const result = await parseWithExcelJSStreaming(fileBuffer);

        logExcel("parse completed", {
          strategy,
          durationMs: Date.now() - startedAt,
          totalRowsInFile: result.totalRowsInFile,
          validRows: result.validRows.length,
          skipped: result.skipped,
        });

        return result;
      }

      if (strategy === "sheetjs-fallback") {
        const result = await parseWithSheetJSFallback(fileBuffer);

        logExcel("parse completed", {
          strategy,
          durationMs: Date.now() - startedAt,
          totalRowsInFile: result.totalRowsInFile,
          validRows: result.validRows.length,
          skipped: result.skipped,
        });

        return result;
      }
    } catch (error) {
      lastError = error;
      logExcel("parse strategy failed", {
        strategy,
        error: error.message,
        stack: error.stack,
      });
    }
  }

  throw new Error(
    lastError?.message || "Could not read Excel file. Please re-export it as .xlsx",
  );
};
