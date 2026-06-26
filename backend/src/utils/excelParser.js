import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { toLocalDateString } from "./productBatchHelper.js";

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

const MONTHS = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

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
    throw new Error("Header row with TranNo was not found in the Excel file");
  }

  const columnMap = buildColumnMap(rows[headerIndex]);
  const requiredColumns = ["tranNo", "product", "subProduct", "tagPacketNo"];

  for (const column of requiredColumns) {
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
        if (normalizeHeader(rawRow[0]) !== "tranno") {
          continue;
        }

        columnMap = buildColumnMap(rawRow);
        const requiredColumns = ["tranNo", "product", "subProduct", "tagPacketNo"];

        for (const column of requiredColumns) {
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
    throw new Error("Header row with TranNo was not found in the Excel file");
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

const EXCEL_SERIAL_MAX = 1_000_000;
const EXCEL_UNIX_EPOCH_SERIAL = 25_569;

const excelSerialToDateString = (serial) => {
  const utcMs = Math.round((Math.floor(serial) - EXCEL_UNIX_EPOCH_SERIAL) * 86_400_000);
  const date = new Date(utcMs);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return toLocalDateString(date);
};

const parseExcelSerialDate = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 1 && value < EXCEL_SERIAL_MAX) {
      return excelSerialToDateString(value);
    }

    return null;
  }

  const str = String(value ?? "").trim();

  if (/^\d+(\.\d+)?$/.test(str)) {
    const serial = Number(str);

    if (serial >= 1 && serial < EXCEL_SERIAL_MAX) {
      return excelSerialToDateString(serial);
    }
  }

  return null;
};

const formatDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toLocalDateString(value);
  }

  const fromExcelSerial = parseExcelSerialDate(value);

  if (fromExcelSerial) {
    return fromExcelSerial;
  }

  const str = String(value ?? "").trim();
  if (!str) {
    return null;
  }

  const match = str.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (match) {
    const month = MONTHS[match[2].toLowerCase()];
    if (month) {
      return `${match[3]}-${month}-${match[1].padStart(2, "0")}`;
    }
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? str : toLocalDateString(parsed);
};

const findHeaderRowIndex = (rows) =>
  rows.findIndex((row) => normalizeHeader(row[0]) === "tranno");

const buildColumnMap = (headers) => {
  const map = {};
  let piecesCount = 0;
  let weightGramCount = 0;
  let weightCaratCount = 0;

  headers.forEach((header, index) => {
    const key = normalizeHeader(header);

    if (key === "tranno") map.tranNo = index;
    else if (key === "trandate") map.tranDate = index;
    else if (key === "product") map.product = index;
    else if (key === "subproduct") map.subProduct = index;
    else if (key === "tag/packetno") map.tagPacketNo = index;
    else if (key === "grosswt") map.grossWt = index;
    else if (key === "netwt") map.netWt = index;
    else if (key === "counter") map.counter = index;
    else if (key === "size") map.size = index;
    else if (key === "tagtype") map.tagType = index;
    else if (key === "pieces") {
      piecesCount += 1;
      map[piecesCount === 1 ? "pieces" : "stonePieces"] = index;
    } else if (key === "weight(gram)") {
      weightGramCount += 1;
      if (weightGramCount === 1) map.weightGram = index;
    } else if (key === "weight(carat)") {
      weightCaratCount += 1;
      if (weightCaratCount === 1) map.weightCarat = index;
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
  const product = String(row.product ?? "").trim();
  const tranNo = String(row.tranNo ?? "").trim();
  const tagNo = String(row.tagPacketNo ?? "").trim();

  return Boolean(product && !tranNo && !tagNo);
};

const isDataRow = (row) => {
  const tranNo = String(row.tranNo ?? "").trim();
  const tagNo = String(row.tagPacketNo ?? "").trim();
  const product = String(row.product ?? "").trim();

  if (!tranNo || !product) {
    return false;
  }

  if (!/^\d+$/.test(tranNo)) {
    return false;
  }

  if (tagNo && /^\d+$/.test(tagNo)) {
    return false;
  }

  return true;
};

const mapRawRow = (rawRow, columnMap) => ({
  tranNo: getCell(rawRow, columnMap.tranNo),
  tranDate: getCell(rawRow, columnMap.tranDate),
  product: getCell(rawRow, columnMap.product),
  subProduct: getCell(rawRow, columnMap.subProduct),
  tagPacketNo: getCell(rawRow, columnMap.tagPacketNo),
  pieces: getCell(rawRow, columnMap.pieces),
  grossWt: getCell(rawRow, columnMap.grossWt),
  netWt: getCell(rawRow, columnMap.netWt),
  counter: getCell(rawRow, columnMap.counter),
  size: getCell(rawRow, columnMap.size),
  tagType: getCell(rawRow, columnMap.tagType),
  stonePieces: getCell(rawRow, columnMap.stonePieces),
  weightGram: getCell(rawRow, columnMap.weightGram),
  weightCarat: getCell(rawRow, columnMap.weightCarat),
});

const toDbRow = (row) => {
  const tagPacketNo = String(row.tagPacketNo ?? "").trim();

  return {
    tran_no: String(row.tranNo ?? "").trim() || null,
    tran_date: formatDate(row.tranDate),
    product: String(row.product).trim(),
    sub_product: String(row.subProduct ?? "").trim(),
    tag_packet_no: tagPacketNo || null,
    pieces: toNumber(row.pieces),
    gross_wt: toNumber(row.grossWt),
    net_wt: toNumber(row.netWt),
    counter_name: String(row.counter ?? "").trim(),
    size: String(row.size ?? "").trim() || null,
    tag_type: String(row.tagType ?? "").trim() || null,
    item_pieces: toNumber(row.stonePieces),
    weight_gram: toNumber(row.weightGram),
    weight_carat: toNumber(row.weightCarat),
  };
};

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
