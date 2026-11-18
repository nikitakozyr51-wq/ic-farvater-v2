'use strict';
const { escape: esc, inlineHtml, richText, plainText, safeHref } = require('./editorial-text');
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function route(record, kind) {
 if (!SLUG.test(record.slug)) throw Error('Invalid editorial slug');
 return (kind === 'article' ? 'article-' : 'laboratory-') + record.slug + '.html';
}
function mediaHref(url) {
 if (!/^assets\/images\/cms\/[a-zA-Z0-9_./-]+$/.test(url || '') || url.includes('..')) throw Error('Invalid cached editorial media URL');
 return '../' + url;
}
function image(component, { cover = false, card = false, newsCard = false } = {}) {
 if (!component?.image) return '';
 const desktop = component.image, mobile = component.mobileImage;
 const sourceSet = file => Object.values(file.formats || {}).concat(file).filter(f => f.width && f.url).sort((a,b) => a.width - b.width)
  .filter((f,i,a) => i === a.findIndex(g => g.width === f.width)).map(f => `${mediaHref(f.url)} ${f.width}w`).join(', ');
 const fit = value => value === 'contain' ? 'contain' : 'cover';
 const percent = value => Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 50));
 const style = `--image-fit:${fit(component.desktopFit)};--image-fit-mobile:${fit(component.mobileFit)};--image-position:${percent(component.focalX)}% ${percent(component.focalY)}%;--image-position-mobile:${percent(component.mobileFocalX)}% ${percent(component.mobileFocalY)}%`;
 const sizes = newsCard ? '(min-width:1440px) 200px, (min-width:1024px) 15vw, (min-width:768px) 45vw, calc(100vw - 48px)' : card ? '(min-width:1024px) 20vw, 342px' : cover ? '(min-width:1024px) 100vw, calc(100vw - 48px)' : '(min-width:1024px) 648px, calc(100vw - 48px)';
 return `<figure class="editorial-image${cover ? ' editorial-image--cover' : ''}" style="${style}"><picture>${mobile ? `<source media="(max-width:1023.98px)" srcset="${esc(sourceSet(mobile))}" sizes="${sizes}">` : ''}<img src="${esc(mediaHref(desktop.url))}" srcset="${esc(sourceSet(desktop))}" sizes="${sizes}" width="${Number(desktop.width) || 1}" height="${Number(desktop.height) || 1}" alt="${esc(component.alt ?? desktop.alternativeText ?? '')}" ${cover ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></picture>${component.caption ? `<figcaption>${inlineHtml(component.caption)}</figcaption>` : ''}${component.context === 'document' ? `<a class="editorial-image__original" href="${esc(mediaHref(desktop.url))}">Открыть оригинал ↗</a>` : ''}</figure>`;
}
function table(block) {
 const columns = block.columns || [], rows = block.rows || [];
 if (!columns.length || !rows.length) return '';
 if (new Set(columns.map(c => c.key)).size !== columns.length) throw Error('Duplicate editorial table column');
 return `<div class="editorial-table"><table>${block.caption ? `<caption>${inlineHtml(block.caption)}</caption>` : ''}<thead><tr>${columns.map(c => `<th scope="col">${inlineHtml(c.title)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => {
  const cells = new Map((row.cells || []).map(c => [c.columnKey, c.value]));
  if ((row.cells || []).length !== cells.size || [...cells.keys()].some(key => !columns.some(c => c.key === key))) throw Error('Invalid editorial table cells');
  return `<tr>${columns.map(c => `<td data-label="${esc(plainText(c.title))}">${inlineHtml(cells.get(c.key) ?? '')}</td>`).join('')}</tr>`;
 }).join('')}</tbody></table></div>`;
}
function blocks(content = [], { laboratory = false } = {}) {
 const ids = new Set(), explicitIds = new Set(content.map(block => block.anchorKey).filter(Boolean)), toc = [], sections = [], anchors = []; let section = [];
 let chapter = 1, disclosureRun = [], hasDisclosures = false;
 const flushDisclosures = () => { if(disclosureRun.length){section.push(`<div class="editorial-disclosures">${disclosureRun.join('\n')}</div>`);disclosureRun=[];} };
 const flush = () => {
  flushDisclosures();
  if (section.length) {
   if(laboratory&&hasDisclosures&&section[0].startsWith('<h2')&&section[1]?.startsWith('<div class="editorial-richtext"')) section.splice(0,2,`<div class="editorial-section__intro">${section[0]}${section[1]}</div>`);
   else if(laboratory&&!hasDisclosures&&section[0].startsWith('<h2')&&section.length>2&&section.slice(1).every(html=>html.startsWith('<div class="editorial-richtext"')))section=[section[0],`<div class="editorial-paragraphs">${section.slice(1).join('\n')}</div>`];
   if(laboratory){
    const grouped=[];let subsection=[];
    const finish=()=>{if(subsection.length)grouped.push(subsection.length>1?`<div class="editorial-subsection">${subsection.join('\n')}</div>`:subsection[0]);subsection=[];};
    for(const html of section){
     if(html.startsWith('<h3')){finish();subsection.push(html);}
     else if(subsection.length&&html.startsWith('<div class="editorial-richtext"'))subsection.push(html);
     else{finish();grouped.push(html);}
    }
    finish();section=grouped;
   }
   sections.push(`<section class="editorial-section">${section.join('\n')}</section>`);section=[];hasDisclosures=false;
  }
 };
 const anchor = (block, index) => {
  let id = block.anchorKey || 'block-' + (index + 1), suffix = 1;
  if (!block.anchorKey) while (explicitIds.has(id) || ids.has(id)) id = 'block-' + (index + 1) + '-' + (++suffix);
  if (!SLUG.test(id) || ids.has(id) || /^(?:source-\d+|sources|equipment|documents)$/.test(id)) throw Error('Invalid or duplicate editorial anchor');
  ids.add(id); return id;
 };
 content.forEach((block, index) => {
  const kind = block.__component, id = anchor(block, index);
  anchors[index] = id;
  if(kind!=='editorial.disclosure')flushDisclosures();
  if (kind === 'editorial.heading') {
   const level = ['h2','h3','h4'].includes(block.level) ? block.level : 'h2';
   if (level === 'h2') flush();
   if (block.showInContents) toc.push({ id, title: block.text });
   section.push(`<${level} id="${id}">${laboratory&&level==='h2'?`<span class="editorial-section__title">${inlineHtml(block.text)}</span><span class="editorial-section__counter" aria-hidden="true">(${String(++chapter).padStart(2,'0')})</span>`:inlineHtml(block.text)}</${level}>`);
  } else if (kind === 'editorial.text') section.push(`<div class="editorial-richtext" id="${id}">${richText(block.body, { sources: true })}</div>`);
  else if (kind === 'editorial.image') section.push(`<div id="${id}">${image(block)}</div>`);
  else if (kind === 'editorial.list') {
   const tag = block.ordered ? 'ol' : 'ul';
   section.push(`<${tag} class="editorial-list" id="${id}">${(block.items || []).map(item => `<li>${inlineHtml(item.text, { sources: true })}</li>`).join('')}</${tag}>`);
  } else if (kind === 'editorial.table') section.push(`<div id="${id}">${table(block)}</div>`);
  else if (kind === 'editorial.disclosure') {
   const html=`<details class="editorial-disclosure" id="${id}"${block.defaultOpen ? ' open' : ''}><summary>${inlineHtml(block.title)}<span aria-hidden="true">+</span></summary><div class="editorial-disclosure__body">${richText(block.body, { sources: true })}${image(block.image)}${block.table ? table(block.table) : ''}</div></details>`;
   if(laboratory){disclosureRun.push(html);hasDisclosures=true;}else section.push(html);
  }
  else throw Error('Unsupported editorial block: ' + kind);
 });
 flush();
 if(laboratory){
  const contents=[];
  content.forEach((block,index)=>{
   if(block.__component!=='editorial.heading'||!block.showInContents)return;
   let end=index+1;while(end<content.length&&!(content[end].__component==='editorial.heading'&&(!content[end].level||content[end].level==='h2')))end++;
   const checks=(!block.level||block.level==='h2')?content.slice(index+1,end).map((item,offset)=>({item,index:index+1+offset})).filter(({item})=>item.__component==='editorial.disclosure'):[];
   if(checks.length)checks.forEach(({item,index})=>contents.push({id:anchors[index],title:item.title}));else contents.push({id:anchors[index],title:block.text});
  });
  toc.splice(0,toc.length,...contents);
 }
 return { html: sections.join('\n'), toc };
}
function documentMain(record, kind, registry) {
 const isArticle = kind === 'article', body = blocks(record.content,{laboratory:!isArticle});
 const sources = record.sources || [], equipment = record.equipment || [], documents = record.documents || [];
 const chapterCount=(record.content||[]).filter(block=>block.__component==='editorial.heading'&&(!block.level||block.level==='h2')).length;
 const counter=number=>`<span class="editorial-section__counter" aria-hidden="true">(${String(number).padStart(2,'0')})</span>`;
 let equipmentHtml='';
 if (sources.length) {
  if (!isArticle) body.toc.push({ id: 'sources', title: 'Источники' });
  body.html += `<section class="editorial-section editorial-sources" id="sources"><h2>Источники</h2>${sources.map((s,i) => `<p id="source-${i+1}">${i+1}. ${safeHref(s.url) ? `<a href="${esc(safeHref(s.url))}" rel="noopener noreferrer">${inlineHtml(s.title)}</a>` : inlineHtml(s.title)}</p>`).join('')}<p class="editorial-image-note">Изображения — редакционные иллюстрации. Конструкцию и параметры конкретного изделия проверяют по документации производителя.</p></section>`;
 }
 if (equipment.length) {
  body.toc.push({ id: 'equipment', title: 'Оборудование' });
  if(!isArticle&&record.pageKind==='overview')equipmentHtml=`<section class="container editorial-lab-equipment" id="equipment"><h2><span>Оборудование</span>${counter(chapterCount+2+(sources.length?1:0))}</h2><div class="editorial-lab-equipment__grid">${equipment.map(e=>`<article class="editorial-equipment">${image(e.picture)}<div class="editorial-equipment__info"><h3>${inlineHtml(e.name)}</h3>${richText(e.description)}</div></article>`).join('')}</div></section>`;
  else body.html += `<section class="editorial-section" id="equipment"><h2>Оборудование</h2>${equipment.map(e => `<article class="editorial-equipment">${image(e.picture)}<h3>${inlineHtml(e.name)}</h3>${richText(e.description)}</article>`).join('')}</section>`;
 }
 if (documents.length) {
  body.toc.push({ id: 'documents', title: 'Документы' });
  body.html += `<section class="editorial-section" id="documents"><h2>Документы</h2>${documents.map(d => {
   const url = d.file ? mediaHref(d.file.url) : safeHref(d.url);
   return `<p>${url && d.verification === 'confirmed' ? `<a href="${esc(url)}">${inlineHtml(d.title)} ↗</a>` : inlineHtml(d.title)}${d.reference ? `<span class="editorial-document-reference">${inlineHtml(d.reference)}</span>` : ''}</p>`;
  }).join('')}</section>`;
 }
 const relation = isArticle ? 'relatedArticles' : 'relatedServices';
 const related = (record[relation] || []).map(ref => registry.get(ref.externalKey)).filter(item => item && item.externalKey !== record.externalKey).slice(0,5);
 const links = body.toc.map(item => `<a href="#${item.id}">${esc(plainText(item.title))}</a>`).join('');
 const contents = !links ? '' : isArticle
  ? `<aside class="editorial-toc"><p>В этой статье</p><nav aria-label="Содержание статьи">${links}</nav></aside>`
  : `<details class="editorial-toc" open><summary>На этой странице<span aria-hidden="true">⌄</span></summary><nav aria-label="Содержание">${links}</nav></details>`;
 const title=isArticle?articleHeading(esc(plainText(record.title))):`<span class="editorial-intro__title">${inlineHtml(record.title)}</span>${counter(1)}`;
 const titleClass=!isArticle&&plainText(record.title).length>28?' class="editorial-intro__heading--long"':'';
 const relatedTitle=isArticle?'Другие статьи':`<span class="editorial-section__title">Другие услуги</span>${counter(chapterCount+2+(sources.length?1:0)+(equipment.length?1:0)+(documents.length?1:0))}`;
 const cards=related.map(item=>`<a href="${route(item,kind)}" class="editorial-related__card">${image(item.cover,{card:true,newsCard:isArticle})}<span class="editorial-related__title">${esc(plainText(item.title))}</span><span class="editorial-related__details">Подробнее</span><span class="editorial-related__arrow" aria-hidden="true">${isArticle?'↗':'→'}</span></a>`).join('');
 const relatedAnimation=isArticle?' data-animate="fade-up-stagger"':'';
 const relatedHtml=related.length?`<section class="container editorial-related"><h2>${relatedTitle}</h2><div class="editorial-related__grid"${relatedAnimation}>${cards}</div>${isArticle?'<a class="btn-pill btn-pill--solid editorial-related__all" href="news.html">Все статьи</a>':''}</section>`:'';
 return `<main class="editorial-page" data-editorial-kind="${kind}"${isArticle?'':` data-laboratory-page-kind="${record.pageKind==='overview'?'overview':'service'}"`}><section class="editorial-intro"><div class="container editorial-intro__head"><h1${titleClass}>${title}</h1><p>${inlineHtml(record.description || record.intro || '')}</p></div>${image(record.cover, { cover: true })}</section><div class="container editorial-body">${contents}<div class="editorial-reading">${body.html}</div></div>${equipmentHtml}${relatedHtml}</main>`;
}
const NEWS_PAGE_SIZE = 18;
const NEWS_TOPICS = [
 { key: 'components', title: 'Компоненты' },
 { key: 'laboratory', title: 'Лаборатория' },
];
const NEWS_INTRO = 'Подбор компонентов, лабораторный контроль и испытания: разборы для инженеров и специалистов по закупкам.';
const newsRoute = (topic = '', page = 1) => `news${topic ? '-'+topic : ''}${page > 1 ? '-'+page : ''}.html`;
const articleHeading = text => text.replace(/(: как) (?=[А-ЯЁа-яё])/g, '$1\u00a0');
function newsMain(records, current = 1, topic = '') {
 const available = NEWS_TOPICS.filter(item => records.some(record => record.category === item.title));
 const selected = available.find(item => item.key === topic);
 const matching = selected ? records.filter(record => record.category === selected.title) : records;
 const pageCount = Math.ceil(matching.length / NEWS_PAGE_SIZE);
 const shown = matching.slice((current - 1) * NEWS_PAGE_SIZE, current * NEWS_PAGE_SIZE);
 const topics = [{ key:'', title:'Все статьи' }, ...available].map(item =>
  `<a href="${newsRoute(item.key)}"${topic === item.key ? ' aria-current="page"' : ''}>${esc(item.title)}</a>`).join('');
 const cards = shown.map(item => {
  const href = route(item, 'article'), title = esc(plainText(item.title));
  const heading = articleHeading(title);
  return `<article class="news-card" data-animate="fade-up">${image(item.cover, { newsCard:true })}${item.category ? `<p class="news-card__category">${esc(item.category)}</p>` : ''}<h2>${heading}</h2><a class="news-card__more" href="${href}" aria-label="Подробнее: ${title}"><span>Подробнее</span></a></article>`;
 }).join('\n');
 const pagerArrow = (page, label, arrow) => page >= 1 && page <= pageCount
  ? `<a href="${newsRoute(topic, page)}" aria-label="${label}">${arrow}</a>`
  : `<span role="link" aria-disabled="true" aria-label="${label}">${arrow}</span>`;
 const pageNumbers = Array.from({ length:pageCount }, (_,index) => {
  const page = index + 1;
  return page === current ? `<span aria-current="page">${page}</span>` : `<a href="${newsRoute(topic,page)}">${page}</a>`;
 }).join('');
 const pagination = pageCount ? `<nav class="news-pagination" aria-label="Страницы новостей">${pagerArrow(current-1,'Предыдущая страница','←')}${pageNumbers}${pagerArrow(current+1,'Следующая страница','→')}</nav>` : '';
 return `<main class="news-page"><div class="container"><div class="news-intro page-top__head--entry"><h1>Новости<span aria-hidden="true">(01)</span></h1><p>${esc(NEWS_INTRO)}</p></div><nav class="news-topics" aria-label="Темы публикаций">${topics}</nav><div class="news-grid">${cards}</div>${pagination}</div></main>`;
}
function aboutNews(articles) {
 const items = articles.slice(0, 5);
 if (!items.length) return '';
 const cards = items.map(article => {
  const title = esc(plainText(article.title));
  return `<a href="${route(article,'article')}" class="about-news__card">${image(article.cover,{newsCard:true})}<span class="about-news__title">${title}</span><span class="about-news__details">Подробнее</span><span class="about-news__arrow" aria-hidden="true">→</span></a>`;
 });
 return `<section class="container about-news" aria-labelledby="aboutNewsTitle"><h2 id="aboutNewsTitle"><span>Новости</span><span class="about-counter" aria-hidden="true">(04)</span></h2><div class="about-news__grid">${cards.join('\n')}</div><a class="btn-pill btn-pill--solid about-news__all" href="news.html">Новости</a></section>`;
}

module.exports = { route, image, table, blocks, documentMain, newsMain, newsRoute, NEWS_PAGE_SIZE, NEWS_TOPICS, NEWS_INTRO, aboutNews };
