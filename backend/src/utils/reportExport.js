import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

const REPORT_HEADERS = [
  "ID",
  "Verification ID",
  "Verification Date",
  "Product",
  "Sub Product",
  "Center",
  "Tag No",
  "Status",
  "Created At",
];

const mapExportRow = (row) => [
  row.id,
  row.verificationId,
  row.verificationDate,
  row.productName,
  row.subProductName,
  row.centerName,
  row.tagNo,
  row.status,
  row.createdAt,
];

export const buildExcelBuffer = async (data, summary, filters) => {
  const filterRows = [
    ["Stock Verification Report"],
    ["Generated At", new Date().toISOString().replace("T", " ").slice(0, 19)],
    ["Product", filters.productName ?? "All"],
    ["Sub Product", filters.subProductName ?? "All"],
    ["Center", filters.centerName ?? "All"],
    ["Status", filters.status ?? "All"],
    [
      "Date Range",
      filters.fromDate && filters.toDate
        ? `${filters.fromDate} to ${filters.toDate}`
        : "All",
    ],
    [],
    ["Summary"],
    ["Found", summary.foundCount],
    ["Missing", summary.missingCount],
    ["New", summary.newCount],
    ["Total Records", data.length],
    [],
    REPORT_HEADERS,
    ...data.map(mapExportRow),
  ];

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Report");

  for (const row of filterRows) {
    worksheet.addRow(row);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

export const buildPdfBuffer = (data, summary, filters) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).text("Stock Verification Report", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(10);
    doc.text(`Product: ${filters.productName ?? "All"}`);
    doc.text(`Sub Product: ${filters.subProductName ?? "All"}`);
    doc.text(`Center: ${filters.centerName ?? "All"}`);
    doc.text(`Status: ${filters.status ?? "All"}`);
    doc.text(
      `Date Range: ${
        filters.fromDate && filters.toDate
          ? `${filters.fromDate} to ${filters.toDate}`
          : "All"
      }`,
    );
    doc.text(
      `Summary - Found: ${summary.foundCount} | Missing: ${summary.missingCount} | New: ${summary.newCount} | Total: ${data.length}`,
    );
    doc.moveDown();

    const columns = [
      { key: "id", label: "ID", width: 35 },
      { key: "verificationId", label: "Ver ID", width: 45 },
      { key: "verificationDate", label: "Ver Date", width: 95 },
      { key: "productName", label: "Product", width: 90 },
      { key: "subProductName", label: "Sub Product", width: 90 },
      { key: "centerName", label: "Center", width: 80 },
      { key: "tagNo", label: "Tag No", width: 80 },
      { key: "status", label: "Status", width: 55 },
      { key: "createdAt", label: "Created At", width: 95 },
    ];

    const drawTableHeader = () => {
      let x = doc.page.margins.left;
      const y = doc.y;

      doc.font("Helvetica-Bold").fontSize(8);
      columns.forEach((column) => {
        doc.text(column.label, x, y, { width: column.width, lineBreak: false });
        x += column.width;
      });
      doc.moveDown(0.8);
      doc.font("Helvetica").fontSize(7);
    };

    drawTableHeader();

    data.forEach((row, index) => {
      if (doc.y > doc.page.height - 50) {
        doc.addPage({ layout: "landscape" });
        drawTableHeader();
      }

      let x = doc.page.margins.left;
      const y = doc.y;

      columns.forEach((column) => {
        const value = String(row[column.key] ?? "");
        doc.text(value, x, y, { width: column.width, lineBreak: false });
        x += column.width;
      });

      doc.moveDown(0.7);

      if (index === data.length - 1) {
        doc.end();
      }
    });

    if (data.length === 0) {
      doc.text("No records found for the selected filters.");
      doc.end();
    }
  });

export const getExportFileName = (exportType) => {
  const timestamp = new Date().toISOString().slice(0, 10);
  return `stock-verification-report-${timestamp}.${exportType === "pdf" ? "pdf" : "xlsx"}`;
};
