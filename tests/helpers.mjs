// Loads the analysis and report modules into a sandbox (no browser needed).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fill = s => s.replace(/\{\{APP_NAME\}\}/g, 'Lead One ECG').replace(/\{\{FILE_PREFIX\}\}/g, 'LeadOne-ECG').replace(/\{\{VERSION\}\}/g, 'test');
const code = ['core.js', 'report.js'].map(f => fill(readFileSync(join(root, 'src', f), 'utf8'))).join('\n');

export function load() {
  const ctx = vm.createContext({ console, setTimeout, Date, Intl });
  vm.runInContext(code + `
    ;globalThis.api = { orthoTest, planWork, dfaAlpha1, dfaTest, analyze, makeDemo, accBreathing, pmdSamples, gradeAll, overallVerdict, refsFor, ctxView, renderReport, FS, rampTest, lthrTest, zoneTime, exerciseResponse, rollingHR, PCT_ZONES, LTHR_ZONES, maxHrEstimate, ageFormulas, delineate, intervalWork, tempoWork };`, ctx);
  return ctx.api;
}
export const distHtml = () => readFileSync(join(root, 'dist', 'index.html'), 'utf8');
