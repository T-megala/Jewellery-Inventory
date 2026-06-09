import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

function formatExportDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatExportStatus(status) {
  if (status === 'FOUND') return 'Found';
  if (status === 'MISSING') return 'Missing';
  if (status === 'NEW') return 'New';
  return status || '';
}

function mapReportRows(rows) {
  return rows.map((row) => ({
    Date: formatExportDate(row.verificationDate),
    Product: row.product || '',
    'Sub Product': row.subProduct || '',
    Counter: row.counter || '',
    'Tag No': row.tagNo || '',
    Status: formatExportStatus(row.status),
  }));
}

function buildFilename(extension) {
  const date = new Date().toISOString().slice(0, 10);
  return `Stock_Verification_Report_${date}.${extension}`;
}

function buildFilterSummary(filters = {}) {
  const parts = [
    filters.product ? `Product: ${filters.product}` : 'Product: All',
    filters.subProduct ? `Sub Product: ${filters.subProduct}` : 'Sub Product: All',
    filters.counter ? `Counter: ${filters.counter}` : 'Counter: All',
    filters.status ? `Status: ${formatExportStatus(filters.status)}` : 'Status: All',
  ];

  return parts.join('  |  ');
}

export function exportReportToExcel(rows) {
  if (!rows.length) return;

  const sheetData = mapReportRows(rows);
  const worksheet = XLSX.utils.json_to_sheet(sheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock Verification');
  XLSX.writeFile(workbook, buildFilename('xlsx'));
}

export function exportReportToPdf(rows, filters = {}, summary = null) {
  if (!rows.length) return;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Jeyachandran Gold House', 14, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Stock Verification Report', 14, 21);

  doc.setFontSize(8.5);
  doc.setTextColor(90, 80, 70);
  doc.text(buildFilterSummary(filters), 14, 27, { maxWidth: pageWidth - 28 });

  if (summary) {
    doc.text(
      `Total: ${summary.totalTags}  |  Found: ${summary.totalFound}  |  Missing: ${summary.totalMissing}  |  New: ${summary.totalNew}`,
      14,
      32,
      { maxWidth: pageWidth - 28 }
    );
  }

  doc.setTextColor(0, 0, 0);

  autoTable(doc, {
    startY: summary ? 36 : 32,
    head: [['Date', 'Product', 'Sub Product', 'Counter', 'Tag No', 'Status']],
    body: rows.map((row) => [
      formatExportDate(row.verificationDate),
      row.product || '',
      row.subProduct || '',
      row.counter || '',
      row.tagNo || '',
      formatExportStatus(row.status),
    ]),
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.5,
    },
    headStyles: {
      fillColor: [184, 134, 11],
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [253, 248, 238],
    },
    margin: { left: 14, right: 14 },
  });

  doc.save(buildFilename('pdf'));
}
