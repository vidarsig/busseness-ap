// jsPDF ships a CommonJS node build whose exports object is { jsPDF, ... }, so a
// plain default import gives the namespace, not the constructor. The browser build
// the app uses has no such problem — this shim only exists so the generator can run
// the SAME src/utils/exports.ts under Node. Aliased in via esbuild --alias:jspdf.
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);
const mod = req('jspdf');
const ctor = mod?.jsPDF ?? mod?.default?.jsPDF ?? mod?.default ?? mod;

export default ctor;
export const jsPDF = ctor;
