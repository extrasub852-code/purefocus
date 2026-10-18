// Static checks: every JSON file parses and every JS file passes `node --check`.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', 'dist', '.git']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(ROOT);
let failed = 0;

for (const file of files.filter((f) => f.endsWith('.json'))) {
  try {
    JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    failed++;
    console.error(`JSON  FAIL ${path.relative(ROOT, file)}: ${e.message}`);
  }
}

for (const file of files.filter((f) => /\.(m?js)$/.test(f))) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (e) {
    failed++;
    console.error(`JS    FAIL ${path.relative(ROOT, file)}\n${e.stderr}`);
  }
}

const counts = `${files.filter((f) => f.endsWith('.json')).length} JSON, ${files.filter((f) => /\.(m?js)$/.test(f)).length} JS`;
if (failed) {
  console.error(`${failed} file(s) failed (${counts} checked)`);
  process.exit(1);
}
console.log(`All files OK (${counts} checked)`);
