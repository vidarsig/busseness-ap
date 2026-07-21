// Turn an uploaded file into plain text the AI can read.
//
// Spreadsheets (greiðslutafla / payment schedules, bank exports) and CSVs are
// parsed with SheetJS into a simple CSV-style table per sheet. Plain-text files
// are read as-is.
//
// A bank statement can cover many years and be far bigger than the chat can
// hold. Cutting it off silently is dangerous: the AI then answers about "the
// statement" while only seeing the first slice of it. So when a file is too
// big we split it by year, so one whole year can be sent instead of a random
// fragment of all of them. If it still has to be cut, the text says so loudly
// and the AI is told not to draw conclusions from it.

const MAX_CHARS = 60_000; // ~15k tokens — plenty for one year, safe for the chat

export interface YearSlice {
  year: string;
  rows: number;
  text: string;
  tooBig: boolean; // even this single year does not fit
}

export interface ParsedFile {
  name: string;
  text: string;
  truncated: boolean;
  years?: YearSlice[]; // present only when the whole file was too big to send
}

// Pull a 4-digit year out of a row: 2020-05-10, 10.05.2020, 10/05/20.
function rowYear(line: string): string | null {
  const iso = line.match(/\b(\d{4})[-./]\d{1,2}[-./]\d{1,2}\b/);
  if (iso) return iso[1];
  const dmy = line.match(/\b\d{1,2}[-./]\d{1,2}[-./](\d{4})\b/);
  if (dmy) return dmy[1];
  const short = line.match(/\b\d{1,2}[-./]\d{1,2}[-./](\d{2})\b/);
  if (short) return `20${short[1]}`;
  return null;
}

const cut = (text: string) =>
  text.slice(0, MAX_CHARS) +
  '\n…[CUT OFF — the rest of this file was NOT sent. Do not assume anything about the missing rows.]';

// Group the rows of a table by year, keeping the header on every slice so each
// one still reads as a proper table.
function splitByYear(text: string): YearSlice[] | undefined {
  const lines = text.split('\n');
  const headerEnd = Math.min(lines.length, 5); // header is within the first few lines
  const groups = new Map<string, string[]>();
  let firstDataLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const year = rowYear(lines[i]);
    if (!year) continue;
    if (firstDataLine === -1) firstDataLine = i;
    const bucket = groups.get(year);
    if (bucket) bucket.push(lines[i]);
    else groups.set(year, [lines[i]]);
  }

  // Not a dated table (or too few dated rows to be worth splitting).
  if (groups.size < 2 || firstDataLine === -1) return undefined;

  const header = lines.slice(0, Math.min(headerEnd, firstDataLine)).join('\n');

  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a)) // newest year first
    .map(([year, rows]) => {
      const body = (header ? header + '\n' : '') + rows.join('\n');
      const tooBig = body.length > MAX_CHARS;
      return { year, rows: rows.length, text: tooBig ? cut(body) : body, tooBig };
    });
}

export async function fileToText(file: File): Promise<ParsedFile> {
  const isSheet = /\.(xlsx|xls)$/i.test(file.name);
  const isCsv = /\.csv$/i.test(file.name);
  const isText = /\.(txt|tsv)$/i.test(file.name) || file.type.startsWith('text/');

  let text = '';

  if (isSheet) {
    const XLSX = await import('xlsx'); // lazy — keeps app startup small
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    text = wb.SheetNames
      .map(name => {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
        return `# Sheet: ${name}\n${csv}`;
      })
      .join('\n\n');
  } else if (isCsv || isText) {
    text = await file.text();
  } else {
    throw new Error('unsupported');
  }

  if (text.length <= MAX_CHARS) return { name: file.name, text, truncated: false };

  // Too big: offer it a year at a time rather than a meaningless first slice.
  const years = splitByYear(text);
  return { name: file.name, text: cut(text), truncated: true, years };
}
