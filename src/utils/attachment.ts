// Turn an uploaded file into something the AI chat can send.
//  - images (photos of documents)      -> vision block (resized JPEG)
//  - PDFs (statements, loan letters)    -> document block
//  - spreadsheets / CSV / text          -> parsed to text (see fileText.ts)
import { fileToText, YearSlice } from './fileText';
import { prepareImage } from './image';

export type Attachment =
  | { kind: 'text'; name: string; text: string; truncated: boolean; years?: YearSlice[]; year?: string }
  | { kind: 'image'; name: string; dataUrl: string; base64: string; mediaType: string }
  | { kind: 'pdf'; name: string; base64: string };

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export async function prepareAttachment(file: File): Promise<Attachment> {
  if (file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(file.name)) {
    const { dataUrl, base64, mediaType } = await prepareImage(file);
    return { kind: 'image', name: file.name, dataUrl, base64, mediaType };
  }
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    return { kind: 'pdf', name: file.name, base64: await readBase64(file) };
  }
  // xlsx / xls / csv / txt / tsv
  const parsed = await fileToText(file);
  return { kind: 'text', ...parsed };
}
