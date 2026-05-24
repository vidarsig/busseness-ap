import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export interface ExportColumn { header: string; key: string; width?: number; }
export type ExportRow = Record<string, string | number>;

// ── PDF ──────────────────────────────────────────────────────────────────────

export function exportPDF(
  title: string,
  subtitle: string,
  columns: ExportColumn[],
  rows: ExportRow[],
  filename: string,
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Header
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, 18);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(subtitle, 14, 25);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 30,
    head: [columns.map(c => c.header)],
    body: rows.map(r => columns.map(c => r[c.key] ?? '')),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: columns.reduce((acc, c, i) => {
      if (c.width) acc[i] = { cellWidth: c.width };
      return acc;
    }, {} as Record<number, { cellWidth: number }>),
  });

  // Footer
  const pageCount = (doc as jsPDF & { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`${i} / ${pageCount}`, doc.internal.pageSize.width - 14, doc.internal.pageSize.height - 8, { align: 'right' });
    doc.text(new Date().toLocaleDateString(), 14, doc.internal.pageSize.height - 8);
  }

  doc.save(filename);
}

// ── Excel ─────────────────────────────────────────────────────────────────────

export interface ExcelSheet {
  name: string;
  columns: ExportColumn[];
  rows: ExportRow[];
}

export function exportExcel(sheets: ExcelSheet[], filename: string) {
  const wb = XLSX.utils.book_new();

  sheets.forEach(sheet => {
    const wsData = [
      sheet.columns.map(c => c.header),
      ...sheet.rows.map(r => sheet.columns.map(c => r[c.key] ?? '')),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Column widths
    ws['!cols'] = sheet.columns.map(c => ({ wch: c.width ?? 16 }));

    // Bold header row
    sheet.columns.forEach((_, ci) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: ci });
      if (ws[cellRef]) {
        ws[cellRef].s = { font: { bold: true }, fill: { fgColor: { rgb: '1E3A8A' } }, fontColor: { rgb: 'FFFFFF' } };
      }
    });

    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  });

  XLSX.writeFile(wb, filename);
}
