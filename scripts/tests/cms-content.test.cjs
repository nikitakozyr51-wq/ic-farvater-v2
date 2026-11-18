const test = require('node:test'), assert = require('node:assert/strict');
const { escape, safeHref, inlineHtml, richText, editableInline } = require('../editorial-text.js');
const { client, populateQuery, verifyDynamicZone } = require('../cms-client.js');
test('Every editorial scalar fragment survives REST query serialization; an empty fragment fails before export', () => {
 const contract = require('../../contracts/editorial-v1.json');
 for (const cfg of Object.values(contract.types)) {
  const query = populateQuery(cfg.populate);
  assert.equal(query.get('populate[content][on][editorial.text][fields][1]'), 'body');
  assert.equal(query.get('populate[content][on][editorial.text][fields][2]'), 'lead');
  assert.equal(query.get('populate[content][on][editorial.heading][fields][1]'), 'text');
  assert.equal(query.get('populate[content][on][editorial.heading][fields][3]'), 'showInContents');
 }
 assert.throws(() => populateQuery({content:{on:{'editorial.text':{}}}}), /Empty CMS dynamic-zone fragment/);
});
test('Independent component inventory rejects silently omitted or reordered dynamic-zone blocks', () => {
 const row={documentId:'page',content:[{id:1,__component:'editorial.heading'},{id:1,__component:'editorial.text'},{id:1,__component:'editorial.disclosure'}]};
 verifyDynamicZone([row],[structuredClone(row)]);
 assert.throws(()=>verifyDynamicZone([{...row,content:row.content.slice(2)}],[row]), /Incomplete CMS dynamic-zone export/);
 assert.throws(()=>verifyDynamicZone([{...row,content:[...row.content].reverse()}],[row]), /Incomplete CMS dynamic-zone export/);
 assert.throws(()=>verifyDynamicZone([row],[]), /inventory changed/);
 assert.throws(()=>verifyDynamicZone([{...row,content:[{__component:'editorial.text'}]}],[row]), /Missing CMS component identity/);
});
test('CMS inline content cannot close the shell or inject handlers', () => {
 assert.equal(inlineHtml('Адрес<br>Город&nbsp;России'), 'Адрес<br>Город\u00a0России');
 const value = inlineHtml('<script>alert(1)</script><img src=x onerror=alert(1)><a href="jav&#x61;script:alert(1)">текст</a></header>');
 assert.equal(value, 'текст'); assert.equal(safeHref('javascript:alert(1)'), ''); assert.equal(safeHref('//evil.example'), '');
 assert.equal(escape('<test>'), '&lt;test&gt;');
});
test('CMS inline updates preserve equivalent NBSP spelling without retaining unsafe markup or stale links', () => {
 const accepted='Подберём из&nbsp;каталога и&nbsp;пришлём прайс.';
 assert.equal(editableInline('Подберём из каталога и пришлём прайс.',accepted),accepted);
 assert.equal(editableInline(accepted,accepted),accepted);
 assert.equal(editableInline('Новый текст',accepted),'Новый текст');
 assert.equal(editableInline('',accepted),'');
 assert.equal(editableInline(null,accepted),'');
 assert.equal(editableInline('Текст','<img src=x onerror=alert(1)>Текст'),'Текст');
 assert.equal(editableInline('','<script>alert(1)</script>'),'');
 assert.equal(editableInline('<a href="/new">Текст</a>','<a href="/old">Текст</a>'),'<a href="/new">Текст</a>');
 assert.equal(editableInline('Текст','<strong>Текст</strong>'),'Текст');
});

test('Markdown preserves formatting and keeps raw HTML inert', () => {
 const value = richText('**Текст**\n\n<img src=x onerror=alert(1)>');
 assert.match(value, /<strong>Текст<\/strong>/); assert(!value.includes('<img')); assert.match(value, /&lt;img/);
 assert(!richText('[Клик](javascript:alert(1))').includes('href="javascript:'));
 const references = richText('Источник [1]. [Ссылка [2]](https://example.com/a%5B3%5D) и `[4]`.', { sources: true });
 assert.equal((references.match(/editorial-source-ref/g) || []).length, 1);
 assert.match(references, /<code>\[4\]<\/code>/);
});
test('Incomplete CMS pagination fails instead of returning a partial catalogue', async () => {
 const originalFetch = global.fetch;
 global.fetch = async () => ({ ok: true, json: async () => ({ data: [{ documentId: 'one' }], meta: { pagination: { page: 1, pageCount: 1, total: 2, pageSize: 100 } } }) });
 try { await assert.rejects(client({ baseUrl: 'https://cms.invalid.example' }).collection('products'), /incomplete collection/); }
 finally { global.fetch = originalFetch; }
});
