import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRITE = process.argv.includes('--write'), PREVIEW = process.argv.includes('--draft-preview');
if (PREVIEW && process.env.IC_DESIGN_STAGING !== '1') throw Error('Draft generation requires isolated staging');
const tempRoot = fs.realpathSync(os.tmpdir());
const stage = fs.mkdtempSync(path.join(tempRoot, 'ic-farvater-sync-'));
const excluded = name => ['.git','node_modules','.husky'].includes(name) || name.startsWith('.env') || name.startsWith('.token') || name.endsWith('.pending');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function inventory(root, prefix = '') {
 const result = {};
 for (const entry of fs.readdirSync(path.join(root, prefix), { withFileTypes: true })) {
  if (excluded(entry.name)) continue;
  const rel = prefix + entry.name;
  if (entry.isDirectory()) Object.assign(result, inventory(root, rel + '/'));
  else if (entry.isFile()) result[rel] = hash(path.join(root, rel));
 }
 return result;
}
const allowed = rel => rel === 'index.html' || /^pages\/[a-z0-9-]+\.html$/.test(rel)
 || /^js\/(?:[a-z0-9-]+-data\.js|products\.js|[a-z0-9-]+\.min\.js)$/.test(rel)
 || /^css\/[a-z0-9-]+\.min\.css$/.test(rel) || /^assets\/images\/cms\/[a-zA-Z0-9_./-]+$/.test(rel)
 || ['sitemap.xml','scripts/catalog-pages.manifest.json','scripts/editorial-pages.manifest.json','content/editorial.json','content/site-settings.json','content/homepage-hero.json'].includes(rel);
let result;
try {
 fs.cpSync(ROOT, stage, { recursive: true, filter: source => !excluded(path.basename(source)) });
 fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(stage, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
 const before = inventory(ROOT);
 const run = (script, args = []) => {
  const task = spawnSync(process.execPath, [path.join(stage, 'scripts', script), ...args], { cwd: stage, env: { ...process.env, FRONTEND_DIR: stage, FRONTEND_JS_DIR: path.join(stage,'js') }, encoding: 'utf8', timeout: 300000, maxBuffer: 8 * 1024 * 1024 });
  if (task.status !== 0 || task.error) throw Error(`${script} failed before output promotion: ${task.error?.message || task.stderr.slice(-1200)}`);
  console.log('[sync-stage]', script, 'PASS');
 };
 run('generate-data.js', ['--write']);
 run('inject-html.js', ['--write']);
 run('export-editorial.mjs', ['--write', ...(PREVIEW ? ['--draft-preview'] : [])]);
 run('generate-catalog-pages.mjs');
 run('render-editorial.mjs');
 run('build-prod.mjs');
 const after = inventory(stage);
 const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(rel => before[rel] !== after[rel]);
 const unexpected = changed.filter(rel => !allowed(rel));
 if (unexpected.length) throw Error('Generator attempted to change source files: ' + unexpected.join(', '));
 const current = inventory(ROOT);
 if (JSON.stringify(current) !== JSON.stringify(before)) throw Error('Frontend changed during synchronization; retry without overwriting concurrent work');
 // A failed read/build never reaches this point. Source templates and CSS/JS remain outside the write list.
 const promoted = [];
 try {
  if (WRITE) for (const rel of changed) {
   const source = path.join(stage, rel), destination = path.join(ROOT, rel);
   const previous = fs.existsSync(destination) ? fs.readFileSync(destination) : null;
   promoted.push({ destination, previous });
   if (after[rel] === undefined) fs.unlinkSync(destination);
   else { fs.mkdirSync(path.dirname(destination), { recursive: true }); const pending = destination + '.pending'; fs.copyFileSync(source, pending); fs.renameSync(pending, destination); }
  }
 } catch (error) {
  for (const entry of promoted.reverse()) { if (entry.previous === null) { if (fs.existsSync(entry.destination)) fs.unlinkSync(entry.destination); } else fs.writeFileSync(entry.destination, entry.previous); }
  throw error;
 }
 result = { result: 'PASS', mode: PREVIEW ? 'draft-preview' : 'published', write: WRITE, changed: changed.length, changedFiles: changed, sourceFilesProtected: true };
 console.log('[sync-site]', JSON.stringify(result));
} finally {
 const resolved = path.resolve(stage);
 if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith('ic-farvater-sync-')) throw Error('Refusing unexpected temporary cleanup path');
 fs.rmSync(resolved, { recursive: true, force: true });
}
