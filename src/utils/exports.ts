import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export interface ExportColumn { header: string; key: string; width?: number; }
export type ExportRow = Record<string, string | number>;

// ── PDF ──────────────────────────────────────────────────────────────────────

// Build the PDF document (header + table + footer) without saving it, so it can
// be either downloaded (exportPDF) or attached to a share/email (sharePDF).
function buildPDFDoc(
  title: string,
  subtitle: string,
  columns: ExportColumn[],
  rows: ExportRow[],
): jsPDF {
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

  return doc;
}

export function exportPDF(
  title: string,
  subtitle: string,
  columns: ExportColumn[],
  rows: ExportRow[],
  filename: string,
) {
  buildPDFDoc(title, subtitle, columns, rows).save(filename);
}

// Send a PDF to a customer in one tap. On a phone this opens the native share
// sheet with the PDF already attached — the user just picks Gmail / WhatsApp /
// Messages and hits send. On desktop (no file sharing) it downloads the PDF and
// opens the mail app with the message prefilled, so they attach the file that
// was just saved. Returns true if the share sheet was used, false on fallback.
export async function sharePDF(
  title: string,
  subtitle: string,
  columns: ExportColumn[],
  rows: ExportRow[],
  filename: string,
  opts: { emailTo?: string; subject?: string; body?: string } = {},
): Promise<boolean> {
  const doc = buildPDFDoc(title, subtitle, columns, rows);
  const blob = doc.output('blob');
  const file = new File([blob], filename, { type: 'application/pdf' });

  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  };

  if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title, text: opts.body ?? title });
      return true;
    } catch (err) {
      // User dismissed the share sheet — don't silently download something they
      // didn't ask for; just stop.
      if ((err as Error).name === 'AbortError') return false;
      // Any other failure falls through to the download + mail fallback below.
    }
  }

  // Fallback: save the PDF, then open the mail app with the message prefilled.
  doc.save(filename);
  if (opts.emailTo !== undefined) {
    const params = [
      opts.subject ? `subject=${encodeURIComponent(opts.subject)}` : '',
      opts.body ? `body=${encodeURIComponent(opts.body)}` : '',
    ].filter(Boolean).join('&');
    window.location.href = `mailto:${encodeURIComponent(opts.emailTo)}${params ? `?${params}` : ''}`;
  }
  return false;
}

// ── Excel ─────────────────────────────────────────────────────────────────────

export interface ExcelSheet {
  name: string;
  columns: ExportColumn[];
  rows: ExportRow[];
}

// Build + download an .xlsx from a simple table (used for AI-generated reports:
// the AI returns columns + rows, we turn them into a spreadsheet).
export function exportExcelTable(filename: string, sheetName: string, columns: string[], rows: (string | number)[][]) {
  const cols: ExportColumn[] = columns.map((h, i) => ({ header: String(h), key: `c${i}`, width: 18 }));
  const rowObjs: ExportRow[] = rows.map(r => {
    const o: ExportRow = {};
    (r ?? []).forEach((v, i) => { o[`c${i}`] = (typeof v === 'number' ? v : String(v ?? '')); });
    return o;
  });
  const fname = filename.toLowerCase().endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  exportExcel([{ name: (sheetName || 'Skýrsla').slice(0, 31), columns: cols, rows: rowObjs }], fname);
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
