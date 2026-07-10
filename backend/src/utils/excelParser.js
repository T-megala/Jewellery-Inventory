import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import {
  getProductImportMappings,
  REQUIRED_HEADER_FIELDS,
} from "../config/productImportColumnMapping.js";
import {
  buildDynamicColumnMap,
  findHeaderRowIndex,
  isProbableHeaderRow,
  mapRawRowToProductRecord,
  normalizeHeader,
  validateRequiredHeaders,
} from "./productImportMapper.js";

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

const getRowHighestColumnIndex = (rowValues) => {
  if (!rowValues || typeof rowValues !== "object") {
    return 1;
  }

  let highest = 1;

  for (const key of Object.keys(rowValues)) {
    const columnIndex = Number.parseInt(key, 10);

    if (!Number.isNaN(columnIndex) && columnIndex > highest) {
      highest = columnIndex;
    }
  }

  if (Array.isArray(rowValues) && rowValues.length - 1 > highest) {
    highest = rowValues.length - 1;
  }

  return highest;
};

const rowValuesToArray = (rowValues, minCols = 1) => {
  const highest = Math.max(getRowHighestColumnIndex(rowValues), minCols, 1);

  return Array.from({ length: highest }, (_, index) =>
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

  let maxCol = Math.max(
    worksheet.columnCount || 0,
    worksheet.actualColumnCount || 0,
    1,
  );
  const rows = [];

  worksheet.eachRow({ includeEmpty: true }, (row) => {
    maxCol = Math.max(
      maxCol,
      getRowHighestColumnIndex(row.values),
      row.cellCount || 0,
      row.actualCellCount || 0,
    );
    rows.push(rowValuesToArray(row.values, maxCol));
  });

  return rows;
};

const createParseContext = (mappings) => {
  const resolvedMappings = getProductImportMappings(mappings);

  return {
    mappings: resolvedMappings,
    buildColumnMap(headers) {
      const columnMap = buildDynamicColumnMap(headers, resolvedMappings);
      validateRequiredHeaders(columnMap, REQUIRED_HEADER_FIELDS);
      return columnMap;
    },
    mapRow(rawRow, columnMap) {
      return mapRawRowToProductRecord(rawRow, columnMap, resolvedMappings);
    },
  };
};

const logHeaderScanFailure = (rows, mappings) => {
  const samples = rows.slice(0, 8).map((row, index) => ({
    row: index + 1,
    cells: (row ?? [])
      .map((cell) => String(cell ?? '').trim())
      .filter(Boolean)
      .slice(0, 12),
  }));

  logExcel('header row scan failed', { samples });
};

const parseRowsToResult = (rows, parseContext) => {
  const headerIndex = findHeaderRowIndex(rows, parseContext.mappings);

  if (headerIndex === -1) {
    logHeaderScanFailure(rows, parseContext.mappings);
    throw new Error(
      "Header row not found. Expected columns such as Tag Number + Product, or Trans No + Product.",
    );
  }

  const columnMap = parseContext.buildColumnMap(rows[headerIndex]);
  const dataRows = rows.slice(headerIndex + 1);
  const parsedRows = [];

  for (let index = 0; index < dataRows.length; index += 1) {
    const rawRow = dataRows[index];
    const record = parseContext.mapRow(rawRow, columnMap);

    parsedRows.push({
      record,
      rowNumber: headerIndex + index + 2,
    });
  }

  return {
    rows: parsedRows,
    totalRowsInFile: dataRows.length,
    columnMap,
    mappedFieldCount: Object.values(columnMap).reduce(
      (count, tableMap) => count + Object.keys(tableMap).length,
      0,
    ),
  };
};

const parseWithExcelJSStreaming = async (buffer, parseContext) => {
  const startedAt = Date.now();
  logExcel("streaming parse started", { bufferBytes: buffer.length });

  const reader = new ExcelJS.stream.xlsx.WorkbookReader(
    Readable.from(buffer),
    STREAM_READER_OPTIONS,
  );

  let columnMap = null;
  let maxCol = 1;
  const parsedRows = [];
  let totalRowsInFile = 0;
  let sheetHandled = false;
  let headerRowNumber = 0;

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
      maxCol = Math.max(
        maxCol,
        getRowHighestColumnIndex(rowValues),
        row.cellCount || 0,
        row.actualCellCount || 0,
      );
      const rawRow = rowValuesToArray(rowValues, maxCol);

      if (!columnMap) {
        if (!isProbableHeaderRow(rawRow, parseContext.mappings)) {
          continue;
        }

        columnMap = parseContext.buildColumnMap(rawRow);
        headerRowNumber = row.number;

        logExcel("header row found in stream", {
          rowNumber: row.number,
          columnMap,
        });
        continue;
      }

      totalRowsInFile += 1;
      const record = parseContext.mapRow(rawRow, columnMap);

      parsedRows.push({
        record,
        rowNumber: row.number ?? headerRowNumber + totalRowsInFile,
      });
    }

    sheetHandled = true;
  }

  if (!columnMap) {
    logExcel('streaming header row scan failed', {
      rowsScanned: headerRowNumber || 'none',
    });
    throw new Error(
      "Header row not found. Expected columns such as Tag Number + Product, or Trans No + Product.",
    );
  }

  logExcel("streaming parse completed", {
    durationMs: Date.now() - startedAt,
    totalRowsInFile,
    parsedRows: parsedRows.length,
  });

  return {
    rows: parsedRows,
    totalRowsInFile,
    columnMap,
    mappedFieldCount: Object.values(columnMap).reduce(
      (count, tableMap) => count + Object.keys(tableMap).length,
      0,
    ),
  };
};

const parseWithSheetJSFallback = async (buffer, parseContext) => {
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

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: true,
  });
  const result = parseRowsToResult(rows, parseContext);

  logExcel("sheetjs fallback parse completed", {
    durationMs: Date.now() - startedAt,
    totalRowsInFile: result.totalRowsInFile,
    parsedRows: result.rows.length,
  });

  return result;
};

export const parseStockExcel = async (buffer, options = {}) => {
  const fileBuffer = normalizeExcelBuffer(buffer);
  const startedAt = Date.now();
  const parseContext = createParseContext(options.mappings);

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
    mappingCount: parseContext.mappings.length,
  });

  const attempts = [];

  if (fileBuffer.length >= STREAMING_THRESHOLD_BYTES) {
    attempts.push("exceljs-stream");
  } else {
    attempts.push("exceljs-load");
  }

  attempts.push("exceljs-load", "exceljs-stream", "sheetjs-fallback");

  let lastError = null;

  for (const strategy of [...new Set(attempts)]) {
    try {
      if (strategy === "exceljs-load") {
        const workbook = await loadWorkbookWithExcelJS(fileBuffer);
        const worksheet = workbook.worksheets[0] ?? workbook.getWorksheet(1);

        if (!worksheet) {
          throw new Error("Excel file does not contain any sheets");
        }

        const rows = worksheetToRows(worksheet);
        const result = parseRowsToResult(rows, parseContext);

        logExcel("parse completed", {
          strategy,
          durationMs: Date.now() - startedAt,
          totalRowsInFile: result.totalRowsInFile,
          parsedRows: result.rows.length,
          mappedFieldCount: result.mappedFieldCount,
        });

        return result;
      }

      if (strategy === "exceljs-stream") {
        const result = await parseWithExcelJSStreaming(fileBuffer, parseContext);

        logExcel("parse completed", {
          strategy,
          durationMs: Date.now() - startedAt,
          totalRowsInFile: result.totalRowsInFile,
          parsedRows: result.rows.length,
          mappedFieldCount: result.mappedFieldCount,
        });

        return result;
      }

      if (strategy === "sheetjs-fallback") {
        const result = await parseWithSheetJSFallback(fileBuffer, parseContext);

        logExcel("parse completed", {
          strategy,
          durationMs: Date.now() - startedAt,
          totalRowsInFile: result.totalRowsInFile,
          parsedRows: result.rows.length,
          mappedFieldCount: result.mappedFieldCount,
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
