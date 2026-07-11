// IC Фарватер — production build
// Что делает:
//   1. Минифицирует CSS reset+tokens+base+layout в одну строку → вставляет в
//      <style id="critical-css">…</style> на каждой HTML-странице.
//   2. Минифицирует остальные CSS (components/inner-page/animations) → .min.css рядом с источником.
//   3. Минифицирует JS (main/animations/nbsp + data-файлы) → .min.js рядом с источником.
//   4. Vendor JS не трогает — он уже минифицирован.
//
// Запуск:   npm run build
// Безопасность: source-файлы (css/*.css, js/*.js) НЕ перезаписываются.
//               .min.css / .min.js — это deploy-артефакты, на них ссылается HTML.

import { build, transform } from 'esbuild';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const log = (...a) => console.log('[build-prod]', ...a);

const CRITICAL = ['css/reset.css', 'css/tokens.css', 'css/base.css', 'css/layout.css'];
const CSS_NON_CRITICAL = ['css/components.css', 'css/inner-page.css', 'css/animations.css'];
const JS_APP = [
  'js/main.js', 'js/animations.js', 'js/nbsp.js',
  'js/products.js', 'js/connectors-data.js', 'js/converters-data.js',
  'js/capacitors-data.js', 'js/categories-data.js',
];
const HTML_PAGES = [
  'index.html',
  'pages/about.html', 'pages/products.html', 'pages/product-detail.html',
  'pages/contacts.html', 'pages/privacy-policy.html', 'pages/consent.html',
];

async function minifyCss(path) {
  const src = await readFile(join(ROOT, path), 'utf8');
  const { code } = await transform(src, { loader: 'css', minify: true, charset: 'utf8' });
  return code;
}

async function minifyJs(path) {
  const src = await readFile(join(ROOT, path), 'utf8');
  const { code } = await transform(src, { loader: 'js', minify: true, target: 'es2018', charset: 'utf8' });
  return code;
}

async function writeMin(srcPath, content) {
  const out = join(ROOT, srcPath.replace(/\.(css|js)$/, '.min.$1'));
  await writeFile(out, content, 'utf8');
  const size = (await stat(out)).size;
  return { out, size };
}

async function generateCriticalCss() {
  const parts = [];
  for (const f of CRITICAL) parts.push(await minifyCss(f));
  return parts.join('');
}

const MARK_START = '<!-- BUILD:CRITICAL-CSS-START -->';
const MARK_END = '<!-- BUILD:CRITICAL-CSS-END -->';

async function injectCriticalIntoHtml(htmlPath, criticalCss) {
  const full = join(ROOT, htmlPath);
  let html = await readFile(full, 'utf8');
  const startIdx = html.indexOf(MARK_START);
  const endIdx = html.indexOf(MARK_END);
  if (startIdx === -1 || endIdx === -1) {
    log(`  ! markers not found in ${htmlPath} — пропускаю инлайн (добавь маркеры вручную)`);
    return false;
  }
  const before = html.slice(0, startIdx + MARK_START.length);
  const after = html.slice(endIdx);
  const replaced = `${before}\n  <style id="critical-css">${criticalCss}</style>\n  ${after}`;
  await writeFile(full, replaced, 'utf8');
  return true;
}

(async () => {
  log('1. Минификация foundation CSS (reset/tokens/base/layout) → инлайн');
  const critical = await generateCriticalCss();
  log(`   critical inline: ${critical.length} bytes`);

  log('2. Инжект в HTML файлы между маркерами');
  for (const h of HTML_PAGES) {
    const ok = await injectCriticalIntoHtml(h, critical);
    if (ok) log(`   ✓ ${h}`);
  }

  log('3. Минификация остальных CSS → .min.css');
  for (const f of CSS_NON_CRITICAL) {
    const code = await minifyCss(f);
    const { out, size } = await writeMin(f, code);
    log(`   ✓ ${f} → ${out.replace(ROOT + '\\', '').replace(ROOT + '/', '')} (${size} bytes)`);
  }

  log('4. Минификация JS → .min.js');
  for (const f of JS_APP) {
    try {
      const code = await minifyJs(f);
      const { out, size } = await writeMin(f, code);
      log(`   ✓ ${f} → ${out.replace(ROOT + '\\', '').replace(ROOT + '/', '')} (${size} bytes)`);
    } catch (e) {
      log(`   ✗ ${f}: ${e.message}`);
    }
  }

  // 5. Cache-busting по содержимому: сервер отдаёт .min.* с max-age=1y immutable,
  //    поэтому КАЖДОЕ изменение файла обязано менять ?v= в HTML (иначе вернувшиеся
  //    посетители неделями видят старый каталог — робот синкает данные, а версия
  //    не двигается). HTML не кэшируется (no-cache) → новые ссылки подхватываются сразу.
  log('5. Версии ассетов в HTML по хэшу содержимого (?v=<md5-8>)');
  const VERSIONED = [
    'css/components.min.css', 'css/inner-page.min.css', 'css/animations.min.css',
    'js/main.min.js', 'js/animations.min.js', 'js/nbsp.min.js',
    'js/products.min.js', 'js/connectors-data.min.js', 'js/converters-data.min.js',
    'js/capacitors-data.min.js', 'js/categories-data.min.js',
  ];
  const hashes = {};
  for (const f of VERSIONED) {
    try {
      hashes[f] = createHash('md5').update(await readFile(join(ROOT, f))).digest('hex').slice(0, 8);
    } catch { /* файл ещё не собран — пропуск */ }
  }
  for (const h of HTML_PAGES) {
    const full = join(ROOT, h);
    let html = await readFile(full, 'utf8');
    let replaced = 0;
    for (const [f, ver] of Object.entries(hashes)) {
      const base = f.split('/').pop().replace(/\./g, '\\.');
      const re = new RegExp(`((?:href|src)="[^"]*${base})(?:\\?v=[^"]*)?"`, 'g');
      html = html.replace(re, (m, pre) => { replaced++; return `${pre}?v=${ver}"`; });
    }
    await writeFile(full, html, 'utf8');
    log(`   ✓ ${h}: ${replaced} ссылок версионировано`);
  }

  log('Готово.');
})();
