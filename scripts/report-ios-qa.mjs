import { readFile, mkdir, writeFile } from 'node:fs/promises';
const manifest = JSON.parse(await readFile('docs/qa/ios-cases.json', 'utf8'));
const statuses = ['passed', 'failed', 'blocked', 'not-run'];
const cases = new Map(manifest.cases.map((item) => [item.id, item]));
if (cases.size !== manifest.cases.length) throw new Error('Duplicate QA case IDs');
const seen = new Set();
for (const result of manifest.lastRun.results) {
  if (!cases.has(result.caseId) || seen.has(result.caseId) || !statuses.includes(result.status))
    throw new Error('Invalid QA result');
  if (result.status === 'passed' && !result.evidence.length)
    throw new Error('Passed case lacks evidence');
  seen.add(result.caseId);
}
for (const area of manifest.coverageAreas)
  if (area.caseIds.some((id) => !cases.has(id))) throw new Error('Unknown coverage case');
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const rows = manifest.lastRun.results
  .map(
    (result) =>
      `<tr><td>${escape(result.caseId)}</td><td>${escape(cases.get(result.caseId).title)}</td><td>${escape(result.status)} / ${escape(result.mode)}</td><td>${escape(result.notes)}<br>${result.evidence.map(escape).join('<br>')}</td></tr>`,
  )
  .join('');
const counts = statuses
  .map(
    (status) =>
      `${status}: ${manifest.lastRun.results.filter((result) => result.status === status).length}`,
  )
  .join(' · ');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Zhuole Docs iOS QA</title><style>body{font:16px/1.6 system-ui;margin:32px;color:#18382b}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccd8d0;padding:12px;text-align:left}h1{font-size:28px}</style><h1>${escape(manifest.app)} — iOS QA</h1><p>${escape(manifest.lastRun.date)} · ${escape(manifest.lastRun.device)} · ${escape(manifest.lastRun.build)}</p><p>${escape(manifest.lastRun.authSource)}</p><p>${escape(counts)}</p><table><tr><th>Case</th><th>Coverage</th><th>Result</th><th>Evidence and limits</th></tr>${rows}</table><h2>Exclusions</h2><ul>${manifest.lastRun.exclusions.map((value) => `<li>${escape(value)}</li>`).join('')}</ul></html>`;
await mkdir('releases/mobile', { recursive: true });
await writeFile('releases/mobile/ios-qa-report.html', html);
console.log(`Validated ${cases.size} cases; wrote releases/mobile/ios-qa-report.html (${counts}).`);
