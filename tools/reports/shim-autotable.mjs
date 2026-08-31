// Same CJS interop problem as shim-jspdf.mjs, for jspdf-autotable's default export.
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);
const mod = req('jspdf-autotable');
const fn = typeof mod === 'function' ? mod : (mod?.default ?? mod?.autoTable);

export default fn;
export const autoTable = fn;
