import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSharedLayout } from './shared-layout.js';
import { route, documentMain, newsMain, newsRoute, NEWS_PAGE_SIZE, NEWS_TOPICS, NEWS_INTRO } from './editorial-render.js';
import { escape as esc, plainText, safeHref } from './editorial-text.js';
import { replaceOwnedUrls } from './sitemap.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const data = JSON.parse(fs.readFileSync(path.join(ROOT,'content/editorial.json')));
if (data.version !== 1 || !['published','draft-preview'].includes(data.mode) || !Array.isArray(data.articles) || !Array.isArray(data.laboratoryPages)) throw Error('Invalid editorial snapshot');
if (data.mode === 'draft-preview' && process.env.IC_DESIGN_STAGING !== '1') throw Error('Draft pages require isolated staging');
const marker = '<!-- GENERATED:EDITORIAL:V1 -->', manifestPath = path.join(ROOT,'scripts/editorial-pages.manifest.json');
const ownedName = name => /^(?:article-[a-z0-9-]+|laboratory-[a-z0-9-]+|news(?:-(?:components|laboratory))?(?:-[0-9]+)?)\.html$/.test(name);
const previous = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath)) : [];
if (!Array.isArray(previous) || previous.some(f => !ownedName(f)) || new Set(previous).size !== previous.length) throw Error('Invalid editorial ownership manifest');
const template = fs.readFileSync(path.join(ROOT,'templates/editorial-page.html'),'utf8');
const outputs = new Map(), registry = new Map(), noindexPages = new Set();
for (const record of [...data.articles,...data.laboratoryPages]) {
 if (!record.externalKey || registry.has(record.externalKey) || !record.title) throw Error('Invalid editorial identity');
 registry.set(record.externalKey,record);
}
function page(name, record, main, article = false) {
 if (outputs.has(name) || !ownedName(name)) throw Error('Editorial route collision');
 const canonicalCandidate = safeHref(record.seo?.canonical);
 const canonical = canonicalCandidate && /^https:\/\/ic-farvater\.ru\//.test(canonicalCandidate) ? canonicalCandidate : 'https://ic-farvater.ru/pages/' + name;
 const title = plainText(record.seo?.title || record.title) + ' — IC Фарватер';
 const description = plainText(record.seo?.description || record.description || '');
 const noindex = data.mode === 'draft-preview' || record.seo?.noindex === true;
 if (noindex) noindexPages.add(name);
 const cover = record.seo?.ogImage || record.cover?.image;
 const ogImage = cover?.url ? 'https://ic-farvater.ru/' + cover.url : 'https://ic-farvater.ru/assets/images/og-image.jpg';
 const metadata = `<title>${esc(title)}</title>\n<meta name="description" content="${esc(description)}">\n<link rel="canonical" href="${esc(canonical)}">\n<meta name="robots" content="${noindex?'noindex, nofollow':'index, follow'}">\n<meta property="og:type" content="${article?'article':'website'}">\n<meta property="og:site_name" content="IC Фарватер">\n<meta property="og:title" content="${esc(title)}">\n<meta property="og:description" content="${esc(description)}">\n<meta property="og:url" content="${esc(canonical)}">\n<meta property="og:image" content="${esc(ogImage)}">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:title" content="${esc(title)}">\n<meta name="twitter:description" content="${esc(description)}">\n<meta name="twitter:image" content="${esc(ogImage)}">`;
 const html = template.replace('{{EDITORIAL_METADATA}}',()=>metadata).replace('{{EDITORIAL_MAIN}}',()=>main);
 if (/\{\{EDITORIAL_/.test(html)) throw Error('Unresolved editorial template');
 outputs.set(name, marker + '\n' + renderSharedLayout(html,'pages/'+name,{root:ROOT}));
}
for (const [kind,records] of [['article',data.articles],['laboratory-page',data.laboratoryPages]]) {
 for (const record of records) page(route(record,kind),record,documentMain(record,kind,registry),kind==='article');
}
const topics = [{ key:'', title:'Новости', count:data.articles.length }, ...NEWS_TOPICS.map(topic => ({
 ...topic, count:data.articles.filter(article => article.category === topic.title).length,
})).filter(topic => topic.count > 0)];
for (const topic of topics) {
 const pages = Math.max(1, Math.ceil(topic.count / NEWS_PAGE_SIZE));
 for (let n=1; n<=pages; n++) {
  const title = topic.key ? `Новости — ${topic.title}` : 'Новости';
  const seo = topic.key ? { noindex:true } : undefined;
  page(newsRoute(topic.key,n), { title, description:NEWS_INTRO, seo }, newsMain(data.articles,n,topic.key));
 }
}
for (const [name] of outputs) {
 const file = path.join(ROOT,'pages',name);
 if (fs.existsSync(file) && !previous.includes(name)) throw Error('Refusing to overwrite an unowned page: '+name);
 if (fs.existsSync(file) && !fs.readFileSync(file,'utf8').startsWith(marker)) throw Error('Editorial ownership marker missing: '+name);
}
const obsolete = previous.filter(name=>!outputs.has(name));
for(const name of obsolete) {
 const file=path.join(ROOT,'pages',name);
 if(fs.existsSync(file)&&!fs.readFileSync(file,'utf8').startsWith(marker)) throw Error('Refusing to remove an unowned page: '+name);
}
let changed=0;
for(const [name,html] of outputs) {
 const file=path.join(ROOT,'pages',name);
 if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==html) { changed++;if(!CHECK)fs.writeFileSync(file,html); }
}
if(!CHECK) {
 for(const name of obsolete) { const file=path.join(ROOT,'pages',name);if(fs.existsSync(file))fs.unlinkSync(file); }
 fs.writeFileSync(manifestPath,JSON.stringify([...outputs.keys()].sort(),null,2)+'\n');
 const sitemapFile=path.join(ROOT,'sitemap.xml'), old=fs.readFileSync(sitemapFile,'utf8');
 const owned=new Set([...previous,...outputs.keys()].map(name=>'https://ic-farvater.ru/pages/'+name));
 const entries=[...outputs.keys()].filter(name=>!noindexPages.has(name)).sort().map(name=>`<url><loc>https://ic-farvater.ru/pages/${name}</loc></url>`);
 fs.writeFileSync(sitemapFile,replaceOwnedUrls(old,owned,entries));
}
console.log('[render-editorial]',JSON.stringify({pages:outputs.size,changed,removed:obsolete.length,check:CHECK}));
