import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const TABLE_HEADERS = ['Date', 'Product', 'Sub Product', 'Counter', 'Tag No', 'Status'];

function formatExportDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatExportStatus(status) {
  if (status === 'FOUND') return 'Found';
  if (status === 'MISSING') return 'Missing';
  if (status === 'NEW') return 'New';
  return status || '';
}

function mapReportRows(rows) {
  return rows.map((row) => [
    formatExportDate(row.verificationDate),
    row.product || '',
    row.subProduct || '',
    row.counter || '',
    row.tagNo || '',
    formatExportStatus(row.status),
  ]);
}

function buildFilename(extension) {
  const date = new Date().toISOString().slice(0, 10);
  return `Stock_Verification_Report_${date}.${extension}`;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function exportReportToExcel(rows) {
  if (!rows.length) return;

  const sheetRows = [
    ['Jeyachandran Gold House'],
    ['Stock Verification Report'],
    [`Generated: ${new Date().toLocaleString('en-IN')}`],
    [],
    TABLE_HEADERS,
    ...mapReportRows(rows),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  worksheet['!cols'] = [
    { wch: 22 },
    { wch: 28 },
    { wch: 28 },
    { wch: 20 },
    { wch: 18 },
    { wch: 12 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(blob, buildFilename('xlsx'));
}

export function exportReportToPdf(rows) {
  if (!rows.length) return;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const tableWidth = pageWidth - margin * 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Jeyachandran Gold House', margin, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Stock Verification Report', margin, 21);

  autoTable(doc, {
    startY: 26,
    head: [TABLE_HEADERS],
    body: mapReportRows(rows),
    tableWidth,
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.5,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [184, 134, 11],
      textColor: 255,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: tableWidth * 0.14 },
      1: { cellWidth: tableWidth * 0.24 },
      2: { cellWidth: tableWidth * 0.24 },
      3: { cellWidth: tableWidth * 0.18 },
      4: { cellWidth: tableWidth * 0.12 },
      5: { cellWidth: tableWidth * 0.08 },
    },
    alternateRowStyles: {
      fillColor: [253, 248, 238],
    },
    margin: { left: margin, right: margin },
  });

  doc.save(buildFilename('pdf'));
}
