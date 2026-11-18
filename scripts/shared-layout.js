'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { inlineHtml, plainText, editableInline, escape: esc, safeHref } = require('./editorial-text');
const { aboutNews } = require('./editorial-render');
const ROOT = path.resolve(__dirname, '..');
const jsonCache = new Map();
function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  const stat = fs.statSync(file), signature = stat.mtimeMs + ':' + stat.size;
  const cached = jsonCache.get(file);
  if (cached?.signature === signature) return cached.value;
  const value = JSON.parse(fs.readFileSync(file, 'utf8')); jsonCache.set(file, { signature, value }); return value;
}
const SHELL = {
  header: /<header\b[^>]*\bclass="header(?:\s[^"]*)?"[^>]*>[\s\S]*?<\/header>/g,
  footer: /<footer\b[^>]*\bclass="footer(?:\s[^"]*)?"[^>]*>[\s\S]*?<\/footer>/g,
};

function elementRange(html, className) {
  const tags = /<\/?div\b[^>]*>/g;
  let match, start = -1, depth = 0;
  while ((match = tags.exec(html))) {
    if (start < 0) {
      const classes = match[0].match(/\bclass="([^"]*)"/)?.[1].split(/\s+/) || [];
      if (!classes.includes(className)) continue;
      start = match.index;
      depth = 1;
    } else {
      depth += match[0].startsWith('</') ? -1 : 1;
      if (!depth) return { start, end: tags.lastIndex, html: html.slice(start, tags.lastIndex) };
    }
  }
  throw new Error(`Missing or unbalanced layout region: ${className}`);
}

function replaceElement(html, className, replacement) {
  const range = elementRange(html, className);
  return html.slice(0, range.start) + replacement + html.slice(range.end);
}

function markerValues(html) {
  const values = {};
  for (const m of html.matchAll(/<!--\s*cms:([\w.-]+)\s*-->([\s\S]*?)<!--\s*\/cms\s*-->/g)) values[m[1]] = m[2];
  return values;
}

function renderSharedLayout(html, relativeFile, options = {}) {
  html = html.replace(/\r\n/g, '\n');
  const root = options.root || ROOT;
  const rel = relativeFile.replaceAll('\\', '/');
  const state = readJson(path.join(root, 'templates/layout-state.json'));
  const page = state.pages[rel] || state.pages['pages/product-detail.html'];
  const existingFooter = html.match(SHELL.footer)?.[0];
  if (!existingFooter) throw new Error(`${rel}: footer missing`);
  const settingsPath = path.join(root, 'content/site-settings.json');
  const settings = readJson(settingsPath, { version: 1, values: {} });
  if (settings.version !== 1 || !settings.values || typeof settings.values !== 'object') throw Error('Invalid site settings snapshot');
  const values = { ...state.defaults, ...markerValues(html), ...settings.values, ...options.values };
  const editorial = readJson(path.join(root, 'content/editorial.json'), { articles: [], laboratoryPages: [] });
  const labPage = /^pages\/laboratory-([a-z0-9-]+)\.html$/.exec(rel);
  const context = labPage && editorial.laboratoryPages.find(record => record.slug === labPage[1]);
  if (typeof context?.footerCtaTitle === 'string') values['site-setting.footerNewsletterTitle'] = context.footerCtaTitle;
  if (typeof context?.footerCtaDescription === 'string') values['site-setting.footerNewsletterDesc'] = context.footerCtaDescription;
  const href = target => path.posix.relative(path.posix.dirname(rel), target) || path.posix.basename(target);
  const labs = editorial.laboratoryPages;
  const labLink = record => `<a href="${href('pages/laboratory-' + record.slug + '.html')}">${inlineHtml(record.navigationTitle || record.title)}</a>`;
  const columns = [
    { title: 'Лаборатория', records: labs.filter(r => ['overview','bearings'].includes(r.slug)) },
    ...['Контроль ЭКБ','Испытания ЭКБ','Испытания РЭА'].map(title => ({ title, records: labs.filter(r => r.group === title) })),
  ];
  const labNavigation = `<div class="container laboratory-navigation"><div class="laboratory-navigation__columns">${columns.filter(group => group.records.length).map(group => `<div class="laboratory-navigation__group"><h3>${group.title}</h3><div>${group.records.map(labLink).join('')}</div></div>`).join('')}</div>${labs.some(r => r.group === 'По воздействию') ? `<div class="laboratory-navigation__impact"><p>По воздействию</p>${labs.filter(r=>r.group==='По воздействию').map(r=>labLink(r).replace('</a>',' <span aria-hidden="true">→</span></a>')).join('')}</div>` : ''}</div>`;
  const siteSnapshotPresent = fs.existsSync(settingsPath);
  const phones = Array.isArray(values['site-setting.phones']) ? values['site-setting.phones'] : siteSnapshotPresent ? [] : [{ display: '+7 (812) 209-34-65', href: 'tel:+78122093465', order: 0 }, { display: '+7 (996) 778-88-42', href: 'tel:+79967788842', order: 1 }];
  const phoneLinks = [...phones].sort((a,b)=>(a.order||0)-(b.order||0)).map(phone => {
    if (!/^tel:\+[0-9]+$/.test(phone.href)) throw Error('Invalid footer phone link');
    return `<a href="${esc(phone.href)}" class="footer__phone">${esc(phone.display)}</a>`;
  }).join('\n            ');
  const emails = values['site-setting.emails'];
  const email = Array.isArray(emails) ? emails[0]?.email || '' : siteSnapshotPresent ? '' : 'info@ic-farvater.ru';
  const emailLink = email && safeHref('mailto:' + email) ? `<a href="${esc('mailto:'+email)}" class="footer__email">${esc(email)}</a>` : '';
  const mobilePhone = String(phones.find(phone => /моб/i.test(phone.label || ''))?.display || phones[0]?.display || values['site-setting.phone'] || '').replace(/[()]/g,'');
  const mobilePhoneHref = 'tel:+' + String(mobilePhone).replace(/\D/g,'');
  const contactField = (label, content) => `<div class="mobile-menu__field"><span class="mobile-menu__field-label">${label}</span><div class="mobile-menu__field-value">${content}</div></div>`;
  const links = {
    HEADER_TONE: rel === 'index.html' || /class="[^"]*\bis-legal-page\b/.test(html) ? 'dark' : 'light',
    HOME_URL: href('index.html'), CATALOG_URL: href('pages/products.html'),
    ABOUT_URL: href('pages/about.html'), CONTACTS_URL: href('pages/contacts.html'),
    SERVICES_URL: rel === 'index.html' ? '#uslugi' : href('index.html') + '#uslugi',
    FAQ_URL: href('pages/about.html') + '#faq',
    PRIVACY_URL: href('pages/privacy-policy.html'), CONSENT_URL: href('pages/consent.html'),
    FOOTER_LAB_LINK: editorial.laboratoryPages.some(record => record.slug === 'overview') ? `<li><a href="${href('pages/laboratory-overview.html')}">лаборатория</a></li>` : '',
    FOOTER_NEWS_LINK: editorial.articles.length ? `<li><a href="${href('pages/news.html')}">новости</a></li>` : '',
    FOOTER_PHONES: phoneLinks, FOOTER_EMAIL: emailLink,
    HEADER_NEWS_LINK: editorial.articles.length ? `<a href="${href('pages/news.html')}" class="header__nav-link">новости</a>` : '',
    HEADER_LAB_TRIGGER: labs.length ? '<button class="header__nav-link header__lab-trigger" id="laboratoryTrigger" type="button" aria-expanded="false" aria-controls="laboratoryNavigation">лаборатория <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="m2 4 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.2"/></svg></button>' : '',
    LABORATORY_NAV: labNavigation,
    MOBILE_NEWS_LINK: editorial.articles.length ? `<a class="mobile-menu__item" href="${href('pages/news.html')}"><span>новости</span><span aria-hidden="true">→</span></a>` : '',
    MOBILE_LAB_NAV: labs.length ? `<details class="mobile-menu__laboratory"><summary class="mobile-menu__item">лаборатория <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></summary>${labNavigation}</details>` : '',
    MOBILE_CONTACTS: contactField('Телефон', mobilePhone ? `<a href="${esc(mobilePhoneHref)}">${esc(mobilePhone)}</a>` : '') + contactField('Email', email ? `<a href="${esc('mailto:'+email)}">${esc(email)}</a>` : '') + contactField('Адрес',inlineHtml(values['site-setting.address'] || '')) + contactField('режим работы',inlineHtml(values['site-setting.workHours'] || 'пн.–пт. 10:00–18:00')),
    PAGES_PREFIX: path.posix.relative(path.posix.dirname(rel), 'pages') + '/',
  };
  if (links.PAGES_PREFIX === './' || links.PAGES_PREFIX === '/') links.PAGES_PREFIX = '';
  const current = rel === 'pages/about.html' ? 'ABOUT' : rel === 'pages/contacts.html' ? 'CONTACTS'
    : rel === 'index.html' || /(?:privacy-policy|consent|news(?:-\d+)?|article-[\w-]+|laboratory-[\w-]+)\.html$/.test(rel) ? '' : 'CATALOG';
  for (const name of ['ABOUT', 'CONTACTS', 'CATALOG']) links['ACTIVE_' + name] = current === name ? ' aria-current="page"' : '';
  const interpolate = template => template.replace(/\{\{([A-Z_]+)\}\}/g, (all, key) => {
    if (!(key in links)) throw new Error(`Unknown layout token: ${key}`);
    return links[key];
  }).replace(/<!--\s*cms:([\w.-]+)\s*-->([\s\S]*?)<!--\s*\/cms\s*-->/g,
    (all, key, fallback) => {
      if (!Object.hasOwn(values, key)) return all;
      // Same safe, stable inline handling as inject-html, including first-time CMS markers.
      const content = editableInline(values[key], fallback);
      return `<!-- cms:${key} -->${content}<!-- /cms -->`;
    });
  links.MOBILE_MENU = interpolate(fs.readFileSync(path.join(root,'templates/partials/mobile-menu.html'),'utf8'));
  let header = interpolate(fs.readFileSync(path.join(root, 'templates/partials/header.html'), 'utf8').replace(/\r\n/g, '\n').trimEnd());
  let footer = fs.readFileSync(path.join(root, 'templates/partials/footer.html'), 'utf8').replace(/\r\n/g, '\n').trimEnd();
  // Keep each accepted form/legal variant, including CMS text edited after extraction.
  const frozen = page.frozen;
  for (const [slot, className] of Object.entries({ NEWSLETTER: 'footer__newsletter', BOTTOM: 'footer__bottom' })) {
    let existing = elementRange(existingFooter, className).html;
    if (slot === 'NEWSLETTER') for (const [suffix, field] of Object.entries({ title: 'footerNewsletterTitle', desc: 'footerNewsletterDesc', disclaimer: 'footerDisclaimer' })) {
      const className = suffix === 'disclaimer' ? 'footer__disclaimer' : 'footer__newsletter-' + suffix;
      const pattern = new RegExp(`(<(?:h3|p)\\b[^>]*class="${className}"[^>]*>)([\\s\\S]*?)(<\\/(?:h3|p)>)`);
      existing = existing.replace(pattern, (all, start, body, end) => body.includes('<!-- cms:') ? all : `${start}<!-- cms:site-setting.${field} -->${body}<!-- /cms -->${end}`);
    }
    footer = footer.replace(`{{FROZEN_${slot}}}`, () => existing || frozen[slot]);
  }
  const categories = existingFooter.match(/<!-- CATS:FOOTERNAV:START -->([\s\S]*?)<!-- CATS:FOOTERNAV:END -->/);
  if (categories) footer = footer.replace(/<!-- CATS:FOOTERNAV:START -->[\s\S]*?<!-- CATS:FOOTERNAV:END -->/,
    () => `<!-- CATS:FOOTERNAV:START -->${categories[1]}<!-- CATS:FOOTERNAV:END -->`);
  footer = interpolate(footer);
  let next = html;
  for (const [type, value] of Object.entries({ header, footer })) {
    if ([...next.matchAll(SHELL[type])].length !== 1) throw new Error(`${rel}: expected one ${type}`);
    next = next.replace(SHELL[type], () => value);
  }
  if (rel === 'pages/about.html') {
    next = next.replace(/<!-- ABOUT_NEWS_START -->[\s\S]*?<!-- ABOUT_NEWS_END -->/,
      () => `<!-- ABOUT_NEWS_START -->\n${aboutNews(editorial.articles)}\n<!-- ABOUT_NEWS_END -->`);
  }
  next = next.replace(/<body\b([^>]*)>/, (all, attrs) => `<body${attrs.replace(/\sdata-site-page="[^"]*"/g,'')} data-site-page="${rel === 'index.html' ? 'home' : 'inner'}">`);
  if (!next.includes('css/navigation.min.css')) next = next.replace('</head>', `<link rel="stylesheet" href="${href('css/navigation.min.css')}">\n</head>`);
  if (!next.includes('js/site-navigation.min.js')) next = next.replace('</body>', `<script src="${href('js/site-navigation.min.js')}" defer></script>\n</body>`);
  return next;
}

function renderSharedLayouts({ root = ROOT, write = false } = {}) {
  const files = ['index.html', ...fs.readdirSync(path.join(root, 'pages')).filter(f => f.endsWith('.html')).map(f => 'pages/' + f)];
  let changed = 0;
  for (const rel of files) {
    const file = path.join(root, rel), old = fs.readFileSync(file, 'utf8');
    const next = renderSharedLayout(old, rel, { root });
    if (next !== old) { changed++; if (write) fs.writeFileSync(file, next); }
  }
  return { files: files.length, changed, write };
}

module.exports = { SHELL, elementRange, replaceElement, markerValues, renderSharedLayout, renderSharedLayouts };
