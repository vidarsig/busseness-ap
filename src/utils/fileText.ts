// Turn an uploaded file into plain text the AI can read.
//
// Spreadsheets (greiðslutafla / payment schedules, bank exports) and CSVs are
// parsed with SheetJS into a simple CSV-style table per sheet. Plain-text files
// are read as-is. Returns the text plus a rough size guard so a giant file can't
// blow the chat context.

const MAX_CHARS = 60_000; // ~15k tokens — plenty for a loan table, safe for the chat

export interface ParsedFile {
  name: string;
  text: string;
  truncated: boolean;
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

  const truncated = text.length > MAX_CHARS;
  if (truncated) text = text.slice(0, MAX_CHARS) + '\n…[truncated]';
  return { name: file.name, text, truncated };
}
