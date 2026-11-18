const { test } = require('node:test');
const assert = require('node:assert/strict');
const { blocks, table, documentMain, newsMain, aboutNews } = require('../editorial-render');
test('Paragraph IDs cannot collide with explicit chapter anchors when full article text is exported', () => {
 const result=blocks([
  {__component:'editorial.text',body:'Введение'},
  {__component:'editorial.heading',anchorKey:'section-1',text:'Первая глава',showInContents:true},
  {__component:'editorial.text',body:'Полный текст'},
  {__component:'editorial.heading',anchorKey:'block-1',text:'Авторский якорь',showInContents:true}
 ]);
 assert.deepEqual(result.toc.map(item=>item.id),['section-1','block-1']);
 assert.match(result.html,/id="block-1-2"/);
 assert.equal(new Set([...result.html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1])).size,4);
});
test('Structured content retains table labels, anchors and default disclosure state', () => {
 const result = blocks([
  {__component:'editorial.heading',text:'Проверка',anchorKey:'check',level:'h2',showInContents:true},
  {__component:'editorial.disclosure',title:'Параметры',anchorKey:'parameters',defaultOpen:true,body:'**Текст**'},
  {__component:'editorial.table',columns:[{key:'a',title:'Параметр'}],rows:[{cells:[{columnKey:'a',value:'Значение'}]}]},
 ]);
 assert.deepEqual(result.toc,[{id:'check',title:'Проверка'}]);
 assert.match(result.html,/<details[^>]+ open>/);
 assert.match(result.html,/<strong>Текст<\/strong>/);
 assert.match(result.html,/<td data-label="Параметр">Значение<\/td>/);
 assert.throws(()=>blocks([{__component:'editorial.heading',text:'a',anchorKey:'same'},{__component:'editorial.heading',text:'b',anchorKey:'same'}]),/duplicate/);
 assert.throws(()=>table({columns:[{key:'a',title:'A'}],rows:[{cells:[{columnKey:'b',value:'x'}]}]}),/Invalid/);
});

test('CMS laboratory subheadings stay with their paragraphs without adding unwanted contents links or changing articles', () => {
 const content=[
  {__component:'editorial.heading',anchorKey:'scope',text:'Объём исследования',level:'h2',showInContents:true},
  {__component:'editorial.heading',anchorKey:'scope-lot',text:'Партия или выборка',level:'h3',showInContents:false},
  {__component:'editorial.text',body:'Вся партия или выборка'},
  {__component:'editorial.heading',anchorKey:'scope-inputs',text:'Исходные данные',level:'h3',showInContents:false},
  {__component:'editorial.text',body:'Документация и задача'},
  {__component:'editorial.text',body:'Дополнительный редактируемый абзац'}
 ];
 const before=structuredClone(content),lab=blocks(content,{laboratory:true}),article=blocks(content);
 assert.equal((lab.html.match(/class="editorial-subsection"/g)||[]).length,2);
 assert.match(lab.html,/<div class="editorial-subsection"><h3 id="scope-lot">Партия или выборка<\/h3>\s*<div class="editorial-richtext"[^>]*><p>Вся партия или выборка<\/p>\s*<\/div><\/div>/);
 assert.match(lab.html,/Документация и задача[\s\S]*Дополнительный редактируемый абзац/);
 assert.deepEqual(lab.toc,[{id:'scope',title:'Объём исследования'}]);
 assert.doesNotMatch(article.html,/editorial-subsection/);assert.deepEqual(content,before);
});
test('Related pages use only the exported registry and pending documents are not linked', () => {
 const record={externalKey:'a',slug:'one',title:'One',content:[],relatedArticles:[{externalKey:'a'},{externalKey:'b'},{externalKey:'unpublished'}],documents:[{title:'Unconfirmed',url:'https://example.com/private.pdf',verification:'needs_confirmation'}]};
 const registry=new Map([['a',record],['b',{externalKey:'b',slug:'two',title:'Two'}]]);
 const html=documentMain(record,'article',registry);
 assert.match(html,/article-two\.html/);assert.doesNotMatch(html,/article-one\.html|unpublished|href="https:\/\/example.com\/private.pdf"/);
 assert.doesNotMatch(documentMain({...record,relatedArticles:[]},'article',registry),/editorial-related__grid/);
});

test('Article contents lists editorial chapters and source references still resolve', () => {
 const record={externalKey:'article:one',slug:'one',title:'Входной контроль: как организовать проверку',
  content:[{__component:'editorial.heading',anchorKey:'preparation',text:'Подготовка',level:'h2',showInContents:true},
   {__component:'editorial.text',body:'Сверьте требования [1].'}],
  sources:[{title:'Документ',url:'https://example.com/standard'}],relatedArticles:[{externalKey:'article:two'}]};
 const html=documentMain(record,'article',new Map([['article:two',{externalKey:'article:two',slug:'two',title:'Другая статья'}]]));
 assert.match(html, /<h1>Входной контроль: как\u00a0организовать проверку<\/h1>/);
 assert.match(html, /<aside class="editorial-toc"><p>В этой статье<\/p><nav[^>]*><a href="#preparation">Подготовка<\/a><\/nav><\/aside>/);
 assert.doesNotMatch(html, /href="#sources"/);
 assert.match(html, /href="#source-1"/);
 assert.match(html, /id="source-1"/);
 assert.match(html, /<div class="editorial-related__grid" data-animate="fade-up-stagger"><a href="article-two\.html" class="editorial-related__card">/);
 assert.match(html, /class="editorial-related__details">Подробнее/);
 assert.match(html, /class="btn-pill btn-pill--solid editorial-related__all" href="news\.html">Все статьи/);
});
test('News pagination is derived from actual records and marks the current page', () => {
 const rows=Array.from({length:19},(_,i)=>({slug:'item-'+i,title:'Item '+i}));
 assert.doesNotMatch(newsMain([]),/news-pagination/);
 const single = newsMain(rows.slice(0,18));
 assert.equal((single.match(/class="news-card" data-animate="fade-up"/g) || []).length, 18);
 assert.match(single, /class="news-intro page-top__head--entry"/);
 assert.match(single, /<nav class="news-pagination"[^>]*>.*aria-disabled="true".*<span aria-current="page">1<\/span>.*aria-disabled="true".*<\/nav>/);
 assert.doesNotMatch(single, /href="news-2\.html"/);
 assert.match(newsMain(rows), /href="news-2\.html" aria-label="Следующая страница"/);
 const page=newsMain(rows,2);
 assert.match(page, /<span aria-current="page">2<\/span>/);
 assert.match(page, /href="news\.html" aria-label="Предыдущая страница"/);
 assert.match(page,/Item 18/);assert.doesNotMatch(page,/Item 17/);
});

test('About news uses up to five records from the current CMS export in order', () => {
 const articles = Array.from({length:6}, (_, index) => ({slug:`company-${index}`, title:`Статья ${index}`}));
 assert.equal(aboutNews([]), '');
 const markup = aboutNews(articles);
 assert.deepEqual([...markup.matchAll(/href="article-(company-\d+)\.html"/g)].map(match=>match[1]), articles.slice(0,5).map(record=>record.slug));
 assert.match(markup, /href="news\.html"/);
});

test('News topic pages slice the topic before pagination and link to their own page numbers', () => {
 const rows = Array.from({ length:40 }, (_, index) => ({
  slug:'item-'+index, title:'Item '+index, category:index % 2 ? 'Лаборатория' : 'Компоненты',
 }));
 const page = newsMain(rows, 2, 'laboratory');
 assert.match(page, /news-laboratory\.html" aria-current="page">Лаборатория/);
 assert.match(page, /<span aria-current="page">2<\/span>/);
 assert.match(newsMain(rows, 1, 'laboratory'), /news-laboratory-2\.html" aria-label="Следующая страница"/);
 assert.match(page, /article-item-37\.html/);
 assert.match(page, /article-item-39\.html/);
 assert.doesNotMatch(page, /article-item-(?:36|38)\.html/);
 assert.equal((page.match(/class="news-card"/g) || []).length, 2);
});
test('Laboratory chapters group editable checks, number sections, and retain related-service routes without an extra CTA', () => {
 const record={externalKey:'lab:one',slug:'one',title:'Услуга',pageKind:'service',content:[
  {__component:'editorial.heading',anchorKey:'checks',text:'Что проверяем',level:'h2',showInContents:true},
  {__component:'editorial.text',body:'Предмет проверки'},
  {__component:'editorial.disclosure',anchorKey:'first',title:'Первая проверка',body:'Полный текст',defaultOpen:true},
  {__component:'editorial.disclosure',anchorKey:'second',title:'Вторая проверка',body:'Другой текст',defaultOpen:false},
  {__component:'editorial.heading',anchorKey:'scope',text:'Объём работ',level:'h2',showInContents:true},
  {__component:'editorial.text',body:'Условия работы'}
 ],relatedServices:[{externalKey:'lab:two'}]};
 const before=structuredClone(record),registry=new Map([['lab:two',{externalKey:'lab:two',slug:'two',title:'Другая услуга'}]]);
 const html=documentMain(record,'laboratory-page',registry);
 assert.deepEqual(blocks(record.content,{laboratory:true}).toc.map(item=>item.id),['first','second','scope']);
 const hiddenGroup=structuredClone(record.content);hiddenGroup[0].showInContents=false;
 assert.deepEqual(blocks(hiddenGroup,{laboratory:true}).toc.map(item=>item.id),['scope']);
 assert.match(html,/editorial-section__intro/);assert.match(html,/editorial-disclosures/);
 assert.match(html,/\(01\)/);assert.match(html,/\(02\)/);assert.match(html,/\(03\)/);assert.match(html,/\(04\)/);
 assert.match(html,/laboratory-two\.html/);assert.match(html,/editorial-related__details">Подробнее/);
 assert.match(html,/<div class="editorial-related__grid">/);
 assert.doesNotMatch(html,/editorial-related__all/);assert.equal((html.match(/<details class="editorial-disclosure"[^>]+ open/g)||[]).length,1);
 assert.deepEqual(record,before);
});
