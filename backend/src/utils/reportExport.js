import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import {
  EXCEL_EXPORT_COLUMNS,
  REPORT_EXPORT_COLUMNS,
  getExcelStatusColumnIndex,
  mapRowToExcelExportValues,
  scaleColumnsToWidth,
} from "./reportExportColumns.js";

const EXCEL_ROW_STYLE_THRESHOLD = 1000;
const EXCEL_WRITE_BATCH_SIZE = 2000;

const logExport = (message, meta = undefined) => {
  if (meta === undefined) {
    console.info(`[report-export] ${message}`);
    return;
  }

  console.info(`[report-export] ${message}`, meta);
};

const PDF_THEME = {
  gold: "#D4AF37",
  goldDark: "#B8860B",
  goldLight: "#FFF8E7",
  goldBorder: "#E8D5A3",
  headerText: "#3D2F0A",
  text: "#2C2416",
  muted: "#7A6A45",
  white: "#FFFFFF",
  zebra: "#FFFBF0",
  found: "#2F6B3A",
  foundBg: "#E8F5E9",
  missing: "#8B2E2E",
  missingBg: "#FDECEC",
  new: "#5C4A12",
  newBg: "#FFF3CC",
};

const getStatusStyle = (status) => {
  const normalized = String(status ?? "").toUpperCase();

  if (normalized === "FOUND") {
    return { fill: PDF_THEME.foundBg, text: PDF_THEME.found };
  }

  if (normalized === "MISSING") {
    return { fill: PDF_THEME.missingBg, text: PDF_THEME.missing };
  }

  if (normalized === "NEW") {
    return { fill: PDF_THEME.newBg, text: PDF_THEME.new };
  }

  return { fill: PDF_THEME.zebra, text: PDF_THEME.text };
};

const toARGB = (hex) => "FF" + hex.replace("#", "").toUpperCase();

const styleExcelHeaderRow = (worksheet) => {
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: toARGB(PDF_THEME.goldDark) },
    };
    cell.font = {
      color: { argb: toARGB(PDF_THEME.white) },
      bold: true,
    };
    cell.border = {
      top: { style: "thin", color: { argb: toARGB(PDF_THEME.goldBorder) } },
      left: { style: "thin", color: { argb: toARGB(PDF_THEME.goldBorder) } },
      bottom: { style: "thin", color: { argb: toARGB(PDF_THEME.goldBorder) } },
      right: { style: "thin", color: { argb: toARGB(PDF_THEME.goldBorder) } },
    };
  });
};

const styleExcelDataRow = (row, item, statusColumnIndex, isZebra) => {
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.border = {
      top: { style: "thin", color: { argb: toARGB(PDF_THEME.goldBorder) } },
      left: { style: "thin", color: { argb: toARGB(PDF_THEME.goldBorder) } },
      bottom: { style: "thin", color: { argb: toARGB(PDF_THEME.goldBorder) } },
      right: { style: "thin", color: { argb: toARGB(PDF_THEME.goldBorder) } },
    };

    let cellFill = isZebra ? PDF_THEME.zebra : PDF_THEME.white;
    let cellColor = PDF_THEME.text;

    if (colNumber === statusColumnIndex) {
      const statusStyle = getStatusStyle(item.status);
      cellFill = statusStyle.fill;
      cellColor = statusStyle.text;
      cell.font = { color: { argb: toARGB(cellColor) }, bold: true };
      cell.alignment = { horizontal: "center" };
    } else {
      cell.font = { color: { argb: toARGB(cellColor) } };
    }

    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: toARGB(cellFill) },
    };
  });
};

const styleExcelStatusCells = (worksheet, data, statusColumnIndex) => {
  for (let index = 0; index < data.length; index += 1) {
    const rowNumber = index + 2;
    const cell = worksheet.getRow(rowNumber).getCell(statusColumnIndex);
    const statusStyle = getStatusStyle(data[index].status);

    cell.font = { color: { argb: toARGB(statusStyle.text) }, bold: true };
    cell.alignment = { horizontal: "center" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: toARGB(statusStyle.fill) },
    };
  }
};

export const buildExcelBuffer = async (data, summary, filters, dbTime) => {
  const startedAt = Date.now();
  logExport("excel generation started", {
    rowCount: data.length,
    filters,
    summary,
  });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Report");

  worksheet.columns = EXCEL_EXPORT_COLUMNS.map((column) => ({
    header: column.label,
    width: column.excelWidth,
  }));

  styleExcelHeaderRow(worksheet);

  const statusColumnIndex = getExcelStatusColumnIndex();
  const useLightweightRows = data.length > EXCEL_ROW_STYLE_THRESHOLD;

  if (useLightweightRows) {
    for (let index = 0; index < data.length; index += EXCEL_WRITE_BATCH_SIZE) {
      const chunk = data.slice(index, index + EXCEL_WRITE_BATCH_SIZE);
      worksheet.addRows(chunk.map(mapRowToExcelExportValues));
    }

    styleExcelStatusCells(worksheet, data, statusColumnIndex);
  } else {
    data.forEach((item, index) => {
      const row = worksheet.addRow(mapRowToExcelExportValues(item));
      styleExcelDataRow(row, item, statusColumnIndex, index % 2 === 1);
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const result = Buffer.from(buffer);

  logExport("excel generation completed", {
    rowCount: data.length,
    bufferBytes: result.length,
    durationMs: Date.now() - startedAt,
    lightweightMode: useLightweightRows,
  });

  return result;
};

const PDF_LAYOUT = {
  margin: 36,
  rowHeight: 14,
  headerBandHeight: 58,
  headerGapAfter: 10,
  footerHeight: 24,
  footerOffsetFromBottom: 14,
  fontSize: 5.5,
  headerFontSize: 6,
  titleFontSize: 17,
};

const PDF_DEBUG = process.env.REPORT_EXPORT_DEBUG === "true";

const logPdfDebug = (message, meta = undefined) => {
  if (!PDF_DEBUG) {
    return;
  }

  logExport(`[pdf-debug] ${message}`, meta);
};

const truncateToWidth = (doc, text, maxWidth) => {
  const value = String(text ?? "");

  if (!value) {
    return "";
  }

  if (doc.widthOfString(value) <= maxWidth) {
    return value;
  }

  const ellipsis = "...";
  let trimmed = value;

  while (
    trimmed.length > 0 &&
    doc.widthOfString(`${trimmed}${ellipsis}`) > maxWidth
  ) {
    trimmed = trimmed.slice(0, -1);
  }

  return trimmed ? `${trimmed}${ellipsis}` : ellipsis;
};

const getContentWidth = (doc) =>
  doc.page.width - doc.page.margins.left - doc.page.margins.right;

const getTableBottomLimit = (doc) =>
  doc.page.height - doc.page.margins.bottom - PDF_LAYOUT.footerHeight;

const getFooterY = (doc) =>
  doc.page.height - PDF_LAYOUT.margin - PDF_LAYOUT.footerOffsetFromBottom;

const getRowsPerPage = (usableHeight) =>
  Math.max(1, Math.floor(usableHeight / PDF_LAYOUT.rowHeight));

const resetDocCursor = (doc, x, y) => {
  doc.x = x;
  doc.y = y;
};

const drawPdfHeaderBand = (doc, summary, totalRows, dbTime) => {
  const { left, top } = doc.page.margins;
  const width = getContentWidth(doc);

  doc.save();
  doc
    .rect(left, top - 8, width, PDF_LAYOUT.headerBandHeight)
    .fill(PDF_THEME.gold);
  doc.rect(left, top - 8, width, 3).fill(PDF_THEME.goldDark);

  doc
    .fillColor(PDF_THEME.headerText)
    .font("Helvetica-Bold")
    .fontSize(PDF_LAYOUT.titleFontSize);
  doc.text("Brand Factory Stock Verification Report", left + 16, top + 6, {
    width: width - 32,
  });

  doc.font("Helvetica").fontSize(8);
  doc.text(`Generated ${dbTime}`, left + 16, top + 28, {
    width: width - 32,
    align: "right",
  });

  doc.font("Helvetica").fontSize(8.5);
  doc.text(
    `Found: ${summary.foundCount}   New: ${summary.newCount}   Missing: ${summary.missingCount}   Total: ${totalRows}`,
    left + 16,
    top + 40,
    { width: width - 32 },
  );

  doc.restore();
  doc.fillColor(PDF_THEME.text);

  return top + PDF_LAYOUT.headerBandHeight + PDF_LAYOUT.headerGapAfter;
};

const drawTableHeaderRow = (doc, columns, y) => {
  const { left } = doc.page.margins;
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const startX = left + Math.max(0, (getContentWidth(doc) - tableWidth) / 2);

  doc.save();
  doc
    .rect(startX, y, tableWidth, PDF_LAYOUT.rowHeight)
    .fill(PDF_THEME.goldDark);
  doc
    .font("Helvetica-Bold")
    .fontSize(PDF_LAYOUT.headerFontSize)
    .fillColor(PDF_THEME.white);

  let x = startX;
  columns.forEach((column) => {
    const padding = column.align === "right" ? 4 : 6;
    doc.text(column.label, x + padding, y + 5, {
      width: column.width - padding * 2,
      align: column.align,
      lineBreak: false,
    });
    x += column.width;
  });

  doc.restore();
  doc.fillColor(PDF_THEME.text);
};

const drawTableRow = (doc, columns, row, y, stripe) => {
  const { left } = doc.page.margins;
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const startX = left + Math.max(0, (getContentWidth(doc) - tableWidth) / 2);

  doc.save();
  doc
    .rect(startX, y, tableWidth, PDF_LAYOUT.rowHeight)
    .fillAndStroke(
      stripe ? PDF_THEME.zebra : PDF_THEME.white,
      PDF_THEME.goldBorder,
    );

  doc.font("Helvetica").fontSize(PDF_LAYOUT.fontSize).fillColor(PDF_THEME.text);

  let x = startX;
  columns.forEach((column) => {
    const padding = column.align === "right" ? 4 : 6;
    const cellWidth = column.width - padding * 2;
    const rawValue = row[column.key] ?? "";
    const displayValue =
      rawValue === null || rawValue === undefined ? "" : String(rawValue);

    if (column.key === "status") {
      const statusStyle = getStatusStyle(rawValue);
      const badgeWidth = Math.min(cellWidth, 42);
      const badgeX = x + (column.width - badgeWidth) / 2;

      doc.roundedRect(badgeX, y + 4, badgeWidth, 10, 3).fill(statusStyle.fill);
      doc.fillColor(statusStyle.text).font("Helvetica-Bold").fontSize(6.5);
      doc.text(displayValue, badgeX, y + 5.5, {
        width: badgeWidth,
        align: "center",
        lineBreak: false,
      });
      doc
        .font("Helvetica")
        .fontSize(PDF_LAYOUT.fontSize)
        .fillColor(PDF_THEME.text);
    } else {
      const value = truncateToWidth(doc, displayValue, cellWidth);
      doc.text(value, x + padding, y + 5, {
        width: cellWidth,
        align: column.align,
        lineBreak: false,
      });
    }

    x += column.width;
  });

  doc.restore();
  doc.fillColor(PDF_THEME.text);
};

const drawPageFooters = (doc) => {
  const range = doc.bufferedPageRange();
  const totalPages = range.count;
  const pagesBeforeFooters = totalPages;

  logPdfDebug("footer pass started", { bufferedPages: totalPages });

  for (
    let pageIndex = range.start;
    pageIndex < range.start + totalPages;
    pageIndex += 1
  ) {
    doc.switchToPage(pageIndex);

    const { left, top } = doc.page.margins;
    const width = getContentWidth(doc);
    const footerY = getFooterY(doc);
    const pageNumber = pageIndex - range.start + 1;
    const cursorBeforeFooter = { x: doc.x, y: doc.y };

    logPdfDebug("drawing footer", { pageNumber, footerY });

    doc.save();
    doc
      .moveTo(left, footerY - 6)
      .lineTo(left + width, footerY - 6)
      .strokeColor(PDF_THEME.gold)
      .stroke();

    doc.font("Helvetica").fontSize(7).fillColor(PDF_THEME.muted);
    doc.text("Brand Factory — Stock Verification Report", left, footerY, {
      width: width / 2,
      lineBreak: false,
      height: PDF_LAYOUT.footerHeight,
      ellipsis: true,
    });
    doc.text(`Page ${pageNumber} of ${totalPages}`, left, footerY, {
      width,
      align: "right",
      lineBreak: false,
      height: PDF_LAYOUT.footerHeight,
      ellipsis: true,
    });
    doc.restore();

    resetDocCursor(doc, left, top);
  }

  const pagesAfterFooters = doc.bufferedPageRange().count;

  if (pagesAfterFooters !== pagesBeforeFooters) {
    logExport("pdf footer pass altered page count", {
      pagesBeforeFooters,
      pagesAfterFooters,
      extraPages: pagesAfterFooters - pagesBeforeFooters,
    });
  }

  doc.fillColor(PDF_THEME.text);
  resetDocCursor(doc, doc.page.margins.left, doc.page.margins.top);
};

const buildPdfColumns = (doc) =>
  scaleColumnsToWidth(
    REPORT_EXPORT_COLUMNS.map((column) => ({
      key: column.key,
      label: column.label,
      width: column.width,
      align: column.align ?? (column.isStatus ? "center" : "left"),
    })),
    getContentWidth(doc),
  );

const renderPdfReportBody = (doc, data, summary, filters, dbTime) => {
  const columns = buildPdfColumns(doc);
  const tableBottomLimit = () => getTableBottomLimit(doc);
  const continuationStartY = () => doc.page.margins.top;

  let currentY = drawPdfHeaderBand(doc, summary, data.length, dbTime);
  let pageNumber = 1;
  let rowsOnPage = 0;
  const firstPageBottom = tableBottomLimit();
  const firstPageUsable = firstPageBottom - currentY - PDF_LAYOUT.rowHeight;
  const continuationUsable =
    tableBottomLimit() - continuationStartY() - PDF_LAYOUT.rowHeight;

  logPdfDebug("pagination layout", {
    firstPageStartY: currentY,
    continuationStartY: continuationStartY(),
    tableBottomLimit: firstPageBottom,
    rowsPerFirstPage: getRowsPerPage(firstPageUsable),
    rowsPerContinuationPage: getRowsPerPage(continuationUsable),
    totalRecords: data.length,
  });

  const startContinuationPage = () => {
    doc.addPage({
      size: "A4",
      layout: "landscape",
      margin: PDF_LAYOUT.margin,
    });
    pageNumber += 1;
    rowsOnPage = 0;
    currentY = continuationStartY();

    logPdfDebug("continuation page added", {
      pageNumber,
      currentY,
      maxY: tableBottomLimit(),
    });

    drawTableHeaderRow(doc, columns, currentY);
    currentY += PDF_LAYOUT.rowHeight;
    resetDocCursor(doc, doc.page.margins.left, currentY);
  };

  const ensureTableSpace = () => {
    if (currentY + PDF_LAYOUT.rowHeight <= tableBottomLimit()) {
      return;
    }

    logPdfDebug("page break", {
      pageNumber,
      currentY,
      maxY: tableBottomLimit(),
      rowsOnPage,
    });

    startContinuationPage();
  };

  if (data.length === 0) {
    doc.font("Helvetica").fontSize(10).fillColor(PDF_THEME.muted);
    doc.text(
      "No records found for the selected filters.",
      doc.page.margins.left,
      currentY,
      { lineBreak: false },
    );
    resetDocCursor(doc, doc.page.margins.left, currentY);
    return { pageNumber, rowsOnPage };
  }

  drawTableHeaderRow(doc, columns, currentY);
  currentY += PDF_LAYOUT.rowHeight;
  resetDocCursor(doc, doc.page.margins.left, currentY);

  for (let index = 0; index < data.length; index += 1) {
    ensureTableSpace();
    drawTableRow(doc, columns, data[index], currentY, index % 2 === 1);
    currentY += PDF_LAYOUT.rowHeight;
    rowsOnPage += 1;
    resetDocCursor(doc, doc.page.margins.left, currentY);

    if (PDF_DEBUG && rowsOnPage % 50 === 0) {
      logPdfDebug("row progress", {
        pageNumber,
        currentY,
        maxY: tableBottomLimit(),
        rowsOnPage,
        rowIndex: index + 1,
      });
    }
  }

  logExport("pdf body rendered", {
    totalRecords: data.length,
    contentPages: pageNumber,
    rowsOnLastPage: rowsOnPage,
  });

  return { pageNumber, rowsOnPage };
};

export const buildPdfBuffer = (data, summary, filters, dbTime) =>
  new Promise((resolve, reject) => {
    const startedAt = Date.now();
    logExport("pdf generation started", {
      rowCount: data.length,
      filters,
      summary,
    });

    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: PDF_LAYOUT.margin,
      bufferPages: true,
    });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => {
      const buffer = Buffer.concat(chunks);
      logExport("pdf generation completed", {
        rowCount: data.length,
        bufferBytes: buffer.length,
        durationMs: Date.now() - startedAt,
      });
      resolve(buffer);
    });
    doc.on("error", (error) => {
      logExport("pdf generation failed", {
        message: error.message,
        durationMs: Date.now() - startedAt,
      });
      reject(error);
    });

    try {
      const bodyStats = renderPdfReportBody(
        doc,
        data,
        summary,
        filters,
        dbTime,
      );
      const pagesBeforeFooters = doc.bufferedPageRange().count;

      drawPageFooters(doc);

      const pagesAfterFooters = doc.bufferedPageRange().count;
      logExport("pdf pagination summary", {
        totalRecords: data.length,
        contentPages: bodyStats.pageNumber,
        bufferedPagesBeforeFooters: pagesBeforeFooters,
        bufferedPagesAfterFooters: pagesAfterFooters,
        extraPagesFromFooters: pagesAfterFooters - pagesBeforeFooters,
      });

      doc.switchToPage(pagesAfterFooters - 1);
      resetDocCursor(doc, doc.page.margins.left, doc.page.margins.top);
      doc.end();
    } catch (error) {
      logExport("pdf generation failed", {
        message: error.message,
        durationMs: Date.now() - startedAt,
      });
      reject(error);
    }
  });

export const getExportFileName = (exportType) => {
  const timestamp = new Date().toISOString().slice(0, 10);
  return `stock-verification-report-${timestamp}.${exportType === "pdf" ? "pdf" : "xlsx"}`;
};
