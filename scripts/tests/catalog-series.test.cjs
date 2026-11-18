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
for (const file of ['catalog-urls', 'connectors-data', 'converters-data']) {
  vm.runInContext(read(`js/${file}.js`), context);
}
const urls = context.CATALOG_URLS;

const pilots = [
  ['razemy', 'et-2rmg', 'CONNECTOR_SERIES', 'seriya-razemy-et-2rmg.html'],
  ['converters', 'irtysh', 'CONVERTER_SERIES', 'seriya-converters-irtysh.html'],
];

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

for (const [category, slug, data, file] of pilots) {
  test(`Generated series page ${slug} has consistent metadata, catalog links, and variant URLs`, () => {
    const series = vm.runInContext(data, context).find(entry => entry.slug === slug);
    const page = parseDocument(read('pages/' + file));
    const elements = (tag, predicate = () => true) => DomUtils.getElementsByTagName(tag, page.children).filter(predicate);
    const head = elements('h1');
    assert.equal(head.length, 1);
    assert.ok(DomUtils.textContent(head[0]).startsWith(series.name));
    assert.ok(elements('title').some(node => DomUtils.textContent(node).includes(series.name)));
    assert.ok(elements('meta', node => node.attribs.name === 'description').some(node => node.attribs.content.includes(series.name)));
    assert.equal(elements('link', node => node.attribs.rel === 'canonical')[0].attribs.href, domain + file);
    assert.ok(elements('a', node => node.attribs['data-kp-product'] === series.name).length);
    assert.ok(elements('img', node => (node.attribs.src || '').includes(series.image)).length);

    const variantLinks = elements('a', node => node.attribs.class === 'pd-card').map(node => node.attribs.href);
    assert.deepEqual(variantLinks, Array.from(series.items, (_, index) => urls.variantFile(category, series, index)));
    for (const href of variantLinks) assert.ok(fs.existsSync(path.join(root, 'pages', href)), href);
    const first = parseDocument(read('pages/' + variantLinks[0]));
    const firstLinks = DomUtils.getElementsByTagName('a', first.children);
    assert.ok(firstLinks.some(node => node.attribs['data-kp-product'] === urls.variantPn(series.items[0])));

    for (const entry of ['products', category]) assert.ok(read(`pages/${entry}.html`).includes(`href="${file}"`));
    assert.equal(read('sitemap.xml').split(`<loc>${domain}${file}</loc>`).length, 2);
    assert.ok(JSON.parse(read('scripts/catalog-pages.manifest.json')).includes(file));
  });
}
