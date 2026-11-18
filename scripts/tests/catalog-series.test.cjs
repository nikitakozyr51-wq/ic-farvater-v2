const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const { parseDocument, DomUtils } = require('htmlparser2');

const root = path.resolve(__dirname, '../..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const domain = 'https://ic-farvater.ru/pages/';
const context = vm.createContext({});
for (const file of ['catalog-urls', 'connectors-data', 'converters-data', 'capacitors-data']) {
  vm.runInContext(read(`js/${file}.js`), context);
}
const urls = context.CATALOG_URLS;

const pilots = [
  ['razemy', 'et-2rmg', 'CONNECTOR_SERIES', 'seriya-razemy-et-2rmg.html'],
  ['converters', 'irtysh', 'CONVERTER_SERIES', 'seriya-converters-irtysh.html'],
];
const categories = [
  ['razemy', 'CONNECTOR_SERIES'],
  ['converters', 'CONVERTER_SERIES'],
  ['capacitors', 'CAPACITOR_SERIES'],
];
const routed = categories.flatMap(([category, data]) =>
  Array.from(vm.runInContext(data, context), series => ({ category, series, file: urls.seriesFile(category, series) })));

test('Catalog series cards open the list of variants inside the catalog', () => {
  const getItems = read('js/main.js').match(/^  function getItems\(cat\) \{[\s\S]*?^  \}/m)[0];
  const catalogContext = vm.createContext({
    CMS_CATS: null,
    state: { seriesType: 'all' },
    normalizeType: value => value,
    shortDesc: () => '',
  });
  for (const [, variable] of categories) catalogContext[variable] = vm.runInContext(variable, context);
  vm.runInContext(getItems, catalogContext);
  for (const [category, variable] of categories) {
    const cards = catalogContext.getItems(category);
    assert.equal(cards.length, catalogContext[variable].length);
    for (const card of cards) assert.equal(card.href, `#${category}/${card.id}`);
  }
});

test('Series URLs are stable and require an enabled series with orderable items', () => {
  for (const [category, slug, , file] of pilots) {
    const series = { slug, group: 'main', items: [{}] };
    assert.equal(urls.seriesFile(category, series), file);
    assert.equal(urls.seriesFile(category, { ...series, group: 'dev' }), null);
    assert.equal(urls.seriesFile(category, { ...series, items: [] }), null);
    assert.equal(urls.seriesFile(category, { ...series, slug: 'other' }), null);
    assert.equal(urls.seriesFile('unknown', series), null);
  }
});

test('Development series URLs are stable even before variants are published', () => {
  assert.equal(urls.seriesFile('razemy', { slug: 'et-rbm4', group: 'dev', items: [] }), 'seriya-razemy-et-rbm4.html');
  assert.equal(urls.seriesFile('razemy', { slug: 'et-rbm4', group: 'main', items: [] }), null);
  assert.equal(urls.seriesFile('razemy', { slug: 'unknown', group: 'dev' }), null);
});

test('Series manifest contains all generated series and sitemap contains only main series', () => {
  const files = routed.filter(entry => entry.file).map(entry => entry.file);
  const manifest = JSON.parse(read('scripts/catalog-pages.manifest.json'));
  assert.deepEqual(manifest.filter(file => file.startsWith('seriya-')).sort(), [...files].sort());
  const indexable = routed.filter(entry => entry.file && entry.series.group === 'main').length;
  assert.equal(read('sitemap.xml').split('<loc>' + domain + 'seriya-').length - 1, indexable);
});

for (const { category, series, file } of routed.filter(entry => entry.file)) {
  test(`Generated series page ${series.slug} has consistent metadata, catalog links, and variant URLs`, () => {
    const development = series.group === 'dev';
    const page = parseDocument(read('pages/' + file));
    const elements = (tag, predicate = () => true) => DomUtils.getElementsByTagName(tag, page.children).filter(predicate);
    const head = elements('h1');
    assert.equal(head.length, 1);
    assert.ok(DomUtils.textContent(head[0]).startsWith(series.name));
    assert.ok(elements('title').some(node => DomUtils.textContent(node).includes(series.name)));
    assert.ok(elements('meta', node => node.attribs.name === 'description').some(node => node.attribs.content.includes(series.name)));
    assert.equal(elements('link', node => node.attribs.rel === 'canonical')[0].attribs.href, domain + file);
    assert.equal(elements('dl', node => node.attribs.class === 'pd-specs').length, 0);
    const primary = elements('a', node => node.attribs.class === 'pd-actions__primary')[0];
    assert.equal(elements('meta', node => node.attribs.name === 'robots')[0].attribs.content, development ? 'noindex, follow' : 'index, follow');
    if (development) {
      assert.equal(primary.attribs.href, 'contacts.html');
      assert.equal(primary.attribs['data-kp-product'], undefined);
      assert.match(DomUtils.textContent(primary), /Уточнить статус/);
      assert.match(DomUtils.textContent(elements('p', node => node.attribs.class === 'product-top__subtitle')[0]), /в\s+разработке/i);
      if (!series.items.length) assert.ok(DomUtils.textContent(page).includes('Пока не опубликованы'));
    } else {
      assert.equal(primary.attribs['data-kp-product'], series.name);
    }
    const heroPhoto = elements('img', node => node.attribs.alt === series.name && (node.attribs.src || '').includes(encodeURI(series.image)));
    if (series.image && fs.existsSync(path.join(root, 'pages', series.image))) assert.equal(heroPhoto.length, 1);
    else assert.ok(elements('span', node => node.attribs.class === 'pd-image__label').length);

    const variantLinks = elements('a', node => node.attribs.class === 'pd-card').map(node => node.attribs.href);
    assert.deepEqual(variantLinks, Array.from(series.items, (_, index) => urls.variantFile(category, series, index)));
    for (const href of variantLinks) assert.ok(fs.existsSync(path.join(root, 'pages', href)), href);
    if (variantLinks.length) {
      const first = parseDocument(read('pages/' + variantLinks[0]));
      const variantAction = DomUtils.getElementsByTagName('a', first.children)
        .find(node => node.attribs.class === 'pd-actions__primary');
      if (development) assert.equal(variantAction.attribs.href, 'contacts.html');
      else {
        const pn = urls.variantPn(series.items[0]);
        assert.equal(variantAction.attribs['data-kp-product'], category === 'capacitors' ? `${series.name} ${pn}` : pn);
      }
    }

    for (const entry of ['products', category]) assert.ok(read(`pages/${entry}.html`).includes(`href="${file}"`));
    assert.equal(read('sitemap.xml').split(`<loc>${domain}${file}</loc>`).length, development ? 1 : 2);
    assert.ok(JSON.parse(read('scripts/catalog-pages.manifest.json')).includes(file));
  });
}
