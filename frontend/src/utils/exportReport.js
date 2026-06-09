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

function buildFilterSummary(filters = {}) {
  const parts = [
    filters.product ? `Product: ${filters.product}` : 'Product: All',
    filters.subProduct ? `Sub Product: ${filters.subProduct}` : 'Sub Product: All',
    filters.counter ? `Counter: ${filters.counter}` : 'Counter: All',
    filters.status ? `Status: ${formatExportStatus(filters.status)}` : 'Status: All',
  ];

  return parts.join('  |  ');
}

function buildExcelSummaryRows(filters = {}, summary = null) {
  const summaryRows = summary
    ? [
        ['Summary', '', '', '', '', ''],
        ['Total Tags', summary.totalTags ?? 0, 'Found', summary.totalFound ?? 0, 'Missing', summary.totalMissing ?? 0],
        ['New', summary.totalNew ?? 0, '', '', '', ''],
        [],
      ]
    : [];

  return [
    ...summaryRows,
    ['Filters', '', '', '', '', ''],
    ['Product', filters.product || 'All', 'Sub Product', filters.subProduct || 'All', 'Counter', filters.counter || 'All'],
    ['Status', filters.status ? formatExportStatus(filters.status) : 'All', '', '', '', ''],
    [],
  ];
}

function escapeExcelHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildExcelCell(value, className = '') {
  const classAttribute = className ? ` class="${className}"` : '';
  return `<td${classAttribute}>${escapeExcelHtml(value)}</td>`;
}

export function exportReportToExcel(rows, filters = {}, summary = null) {
  if (!rows.length) return;

  const summaryRows = buildExcelSummaryRows(filters, summary)
    .filter((row) => row.some((cell) => cell !== ''))
    .map((row) => `<tr>${row.map((cell, index) => buildExcelCell(cell, index % 2 === 0 ? 'meta-label' : 'meta-value')).join('')}</tr>`)
    .join('');

  const tableRows = mapReportRows(rows)
    .map((row) => {
      const statusClass = `status-${String(row[5]).toLowerCase()}`;
      return `<tr>${row.map((cell, index) => buildExcelCell(cell, index === 5 ? statusClass : '')).join('')}</tr>`;
    })
    .join('');

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <style>
      body { font-family: Arial, sans-serif; color: #2f2717; }
      table { border-collapse: collapse; width: 100%; }
      .title { background: #7a4f01; color: #ffffff; font-size: 20px; font-weight: 700; text-align: center; }
      .subtitle { background: #b8860b; color: #ffffff; font-size: 14px; font-weight: 700; text-align: center; }
      .generated { background: #fff4d6; color: #6b5a33; text-align: center; }
      .meta-label { background: #f6e7bd; color: #5f4608; font-weight: 700; }
      .meta-value { background: #fffaf0; color: #2f2717; }
      th { background: #b8860b; color: #ffffff; font-weight: 700; border: 1px solid #8d6507; padding: 8px; text-align: left; }
      td { border: 1px solid #e5d6ae; padding: 7px; vertical-align: top; }
      .spacer td { border: 0; height: 10px; }
      .status-found { background: #dcfce7; color: #166534; font-weight: 700; text-align: center; }
      .status-missing { background: #fee2e2; color: #991b1b; font-weight: 700; text-align: center; }
      .status-new { background: #dbeafe; color: #1e40af; font-weight: 700; text-align: center; }
    </style>
  </head>
  <body>
    <table>
      <colgroup>
        <col style="width: 120px" />
        <col style="width: 220px" />
        <col style="width: 220px" />
        <col style="width: 190px" />
        <col style="width: 150px" />
        <col style="width: 110px" />
      </colgroup>
      <tr><td class="title" colspan="6">Jeyachandran Gold House</td></tr>
      <tr><td class="subtitle" colspan="6">Stock Verification Report</td></tr>
      <tr><td class="generated" colspan="6">Generated: ${escapeExcelHtml(new Date().toLocaleString('en-IN'))}</td></tr>
      <tr class="spacer"><td colspan="6"></td></tr>
      ${summaryRows}
      <tr class="spacer"><td colspan="6"></td></tr>
      <tr>
        <th>Date</th>
        <th>Product</th>
        <th>Sub Product</th>
        <th>Counter</th>
        <th>Tag No</th>
        <th>Status</th>
      </tr>
      ${tableRows}
    </table>
  </body>
</html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = buildFilename('xls');
  link.click();
  URL.revokeObjectURL(url);
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
