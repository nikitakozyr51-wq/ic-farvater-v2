/**
 * Реальные URL каталога (подход A) — ЕДИНЫЙ источник истины для:
 *   · рантайма (main.js: href карточек/поиска + редирект со старых #-адресов);
 *   · генератора статических страниц (scripts/generate-catalog-pages.mjs, через vm).
 * Подключается ПОСЛЕ data-файлов (products/connectors/...), ПЕРЕД main.min.js.
 *
 * Схема имён (все страницы плоско в pages/):
 *   категория  →  <catSlug>.html                       (razemy.html)
 *   вариант    →  <prefix>-<series>-<pn-slug>.html     (razem-et-2rmg14b4sh1a2.html)
 *                 (если slug партномера начинается со слага серии — серия не дублируется)
 *   товар      →  tovar-<name-slug>.html               (tovar-et1310pn1u.html)
 * Транслит согласован со Strapi-слагами (ц→c, ы→y, ъ/ь→'', ё→e).
 */
var CATALOG_URLS = (function () {
  var TR = { 'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya' };
  function slugify(s) {
    s = String(s || '').toLowerCase();
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (TR[ch] != null) out += TR[ch];
      else if (/[a-z0-9]/.test(ch)) out += ch;
      else out += '-';
    }
    return out.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  }
  var CAT_PREFIX = { razemy: 'razem', converters: 'preobrazovatel', capacitors: 'kondensator' };

  // Партномер варианта — ровно как variantSpecs (main.js:875-879): partnumber →
  // displaySub → хвостовой токен displayName → первый токен name (≥5 симв, цифра+буква).
  function variantPn(item) {
    var pn = item.partnumber || item.displaySub || '';
    if (!pn) {
      var dn = item.displayName || item.name || '';
      var m = /^(.+)\s(\S{8,})$/.exec(dn);
      if (m && /\d/.test(m[2]) && /[A-Za-zА-Яа-яЁё]/.test(m[2])) pn = m[2];
    }
    if (!pn) {
      var t = String(item.name || '').split(/\s+/)[0];
      if (t.length >= 5 && /\d/.test(t) && /[A-Za-zА-Яа-яЁё]/.test(t)) pn = t;
    }
    return pn || '';
  }

  // Имена файлов всех вариантов серии (с разрешением дублей партномеров: более
  // поздний дубль получает суффикс -<idx>, известный F24-кейс). Мемоизировано.
  var seriesFilesCache = {};
  function seriesFiles(catSlug, series) {
    if (!CAT_PREFIX[catSlug]) return []; // неизвестная категория → рантайм-фолбэк на hash-ссылку
    var key = catSlug + '/' + series.slug;
    if (seriesFilesCache[key]) return seriesFilesCache[key];
    var taken = {}, files = [];
    var items = series.items || [];
    for (var i = 0; i < items.length; i++) {
      var pn = variantPn(items[i]) || (series.slug + '-' + i);
      var s = slugify(pn);
      var base = s.indexOf(series.slug) === 0
        ? CAT_PREFIX[catSlug] + '-' + s
        : CAT_PREFIX[catSlug] + '-' + series.slug + '-' + s;
      if (taken[base]) base += '-' + i;
      taken[base] = true;
      files.push(base + '.html');
    }
    seriesFilesCache[key] = files;
    return files;
  }
  function variantFile(catSlug, series, idx) {
    var files = seriesFiles(catSlug, series);
    return files[idx] || null;
  }

  // Товары: дубль имени (ЕТ-СР ×2) → суффикс -<id>. Счётчик слагов лениво, один раз.
  var productSlugCount = null;
  function productFile(p) {
    if (!productSlugCount) {
      productSlugCount = {};
      var all = (typeof PRODUCTS !== 'undefined') ? PRODUCTS : [];
      for (var i = 0; i < all.length; i++) {
        var s0 = slugify(all[i].name);
        productSlugCount[s0] = (productSlugCount[s0] || 0) + 1;
      }
    }
    var s = slugify(p.name);
    return 'tovar-' + (productSlugCount[s] > 1 ? s + '-' + p.id : s) + '.html';
  }

  function categoryFile(catSlug) { return catSlug + '.html'; }

  return {
    slugify: slugify,
    variantPn: variantPn,
    variantFile: variantFile,
    productFile: productFile,
    categoryFile: categoryFile,
    CAT_PREFIX: CAT_PREFIX
  };
})();
