/**
 * seed-content.js — Фаза 2.6. Заполняет Strapi single-types ТЕКУЩИМИ значениями
 * из HTML-маркеров (чтобы исключить ручные опечатки и гарантировать байт-идентичность).
 *
 * Читает все маркеры <!-- cms:KEY -->значение<!-- /cms --> из HTML, группирует по
 * single-type (префикс ключа), собирает вложенный payload и PUT'ит в Strapi.
 *
 * Картинки (значение похоже на путь к ассету) НЕ сидятся — media-поля заполняет
 * заказчик загрузкой; пока пусто → inject-html делает fallback на текущий путь.
 *
 * ТРЕБУЕТ WRITE-токен:  $env:STRAPI_TOKEN = "<full/write token>"
 * Запуск:  node scripts/seed-content.js            # показать что засидит (dry)
 *          node scripts/seed-content.js --apply     # реально PUT в Strapi
 *
 * Env: STRAPI_URL, STRAPI_TOKEN (write), FRONTEND_DIR (default ..)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const STRAPI_URL = (process.env.STRAPI_URL || 'https://cms.ic-farvater.ru').replace(/\/$/, '');
const ROOT = process.env.FRONTEND_DIR || path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const TOKEN = process.env.STRAPI_TOKEN || '';

const HTML_FILES = ['index.html', 'pages/about.html', 'pages/contacts.html', 'pages/privacy-policy.html', 'pages/consent.html'];
const MARKER = /<!--\s*cms:([\w.-]+)\s*-->([\s\S]*?)<!--\s*\/cms\s*-->/g;
const IMG_RE = /\.(webp|jpe?g|png|svg|gif|avif)(\?|$)|^\.{0,2}\/?assets\//i;

// разложить "homepage.razemyCards.0.name" → ["homepage", "razemyCards", "0", "name"]
function setNested(root, parts, value) {
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const nextIsIndex = /^\d+$/.test(parts[i + 1]);
    if (/^\d+$/.test(key)) {
      const idx = Number(key);
      if (!Array.isArray(cur)) throw new Error('index on non-array');
      if (cur[idx] === undefined) cur[idx] = nextIsIndex ? [] : {};
      cur = cur[idx];
    } else {
      if (cur[key] === undefined) cur[key] = nextIsIndex ? [] : {};
      cur = cur[key];
    }
  }
  cur[parts[parts.length - 1]] = value;
}

(async () => {
  // 1. собрать все маркеры из HTML
  const byType = {};      // { homepage: {...payload}, 'site-setting': {...} }
  const skippedImg = [];
  let total = 0;
  for (const rel of HTML_FILES) {
    const fp = path.join(ROOT, rel);
    if (!fs.existsSync(fp)) continue;
    const html = fs.readFileSync(fp, 'utf8');
    let m;
    while ((m = MARKER.exec(html)) !== null) {
      const key = m[1];
      const value = m[2];
      if (IMG_RE.test(value)) { skippedImg.push(key); continue; }   // media — не сидим
      const parts = key.split('.');
      const type = parts.shift();
      if (!byType[type]) byType[type] = {};
      setNested(byType[type], parts, value);
      total++;
    }
  }

  console.log(`Найдено текстовых маркеров: ${total}; пропущено картинок: ${skippedImg.length}`);
  for (const [type, payload] of Object.entries(byType)) {
    console.log(`\n--- ${type} (${Object.keys(payload).length} полей верхнего уровня) ---`);
    console.log(JSON.stringify(payload, null, 1).slice(0, 800));
  }

  if (!APPLY) { console.log('\n(dry — ничего не отправлено. Запусти с --apply + WRITE-токеном чтобы залить.)'); process.exit(0); }
  if (!TOKEN) { console.error('Нужен STRAPI_TOKEN (write).'); process.exit(1); }

  for (const [type, payload] of Object.entries(byType)) {
    const res = await fetch(`${STRAPI_URL}/api/${type}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ data: payload }),
    });
    if (!res.ok) { console.error(`✗ PUT ${type} → ${res.status}: ${(await res.text()).slice(0, 300)}`); continue; }
    console.log(`✓ ${type} засижен`);
  }
  console.log('\nГотово. Теперь: node scripts/inject-html.js --check → diff должен быть 0.');
  process.exit(0);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
