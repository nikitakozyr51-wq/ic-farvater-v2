const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..');
test('Editorial unpublication removes only owned routes and refuses changed ownership markers',()=>{
 const snapshotFile=path.join(ROOT,'content/editorial.json');
 if(!fs.existsSync(snapshotFile))throw Error('Integration test requires an exported editorial snapshot');
 const tempRoot=fs.realpathSync(os.tmpdir()),temp=fs.mkdtempSync(path.join(tempRoot,'ic-editorial-test-'));
 try{
  fs.mkdirSync(path.join(temp,'pages'));fs.mkdirSync(path.join(temp,'content'));fs.mkdirSync(path.join(temp,'scripts'));
  for(const file of ['render-editorial.mjs','editorial-render.js','editorial-text.js','shared-layout.js','sitemap.js'])fs.copyFileSync(path.join(ROOT,'scripts',file),path.join(temp,'scripts',file));
  fs.cpSync(path.join(ROOT,'templates'),path.join(temp,'templates'),{recursive:true});
  fs.symlinkSync(path.join(ROOT,'node_modules'),path.join(temp,'node_modules'),process.platform==='win32'?'junction':'dir');
  const sentinel='<main>Existing catalogue: keep this page.</main>';
  fs.writeFileSync(path.join(temp,'pages/catalog-sentinel.html'),sentinel);
  fs.writeFileSync(path.join(temp,'sitemap.xml'),'<?xml version="1.0"?><urlset><url><loc>https://ic-farvater.ru/pages/catalog-sentinel.html</loc></url></urlset>');
  const snapshot=JSON.parse(fs.readFileSync(snapshotFile));snapshot.mode='published';
  const save=()=>fs.writeFileSync(path.join(temp,'content/editorial.json'),JSON.stringify(snapshot));save();
  const run=()=>spawnSync(process.execPath,[path.join(temp,'scripts/render-editorial.mjs')],{cwd:temp,encoding:'utf8'});
  let result=run();assert.equal(result.status,0,result.stderr);
  const manifest=JSON.parse(fs.readFileSync(path.join(temp,'scripts/editorial-pages.manifest.json')));
  const pageCount=rows=>Math.ceil(rows.length/18);
  const expectedTopics=['Компоненты','Лаборатория'].reduce((count,topic)=>count+pageCount(snapshot.articles.filter(article=>article.category===topic)),0);
  assert.equal(manifest.length,snapshot.articles.length+snapshot.laboratoryPages.length+Math.max(1,pageCount(snapshot.articles))+expectedTopics);
  for(const name of manifest.filter(name=>/^news-(?:laboratory|components)/.test(name))){
   assert.match(fs.readFileSync(path.join(temp,'pages',name),'utf8'),/name="robots" content="noindex, nofollow"/);
   assert(!fs.readFileSync(path.join(temp,'sitemap.xml'),'utf8').includes(name));
  }
  const changedFile=path.join(temp,'pages',manifest[0]),original=fs.readFileSync(changedFile,'utf8');
  fs.writeFileSync(changedFile,original.replace('GENERATED:EDITORIAL:V1','OWNER_CHANGED_MARKER'));
  result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/ownership marker missing/);
  assert.equal(fs.readFileSync(changedFile,'utf8'),original.replace('GENERATED:EDITORIAL:V1','OWNER_CHANGED_MARKER'));
  fs.writeFileSync(changedFile,original);
  const sample=snapshot.articles[0];
  assert(sample,'Integration test requires at least one article');
  snapshot.articles=Array.from({length:37},(_,index)=>({
   ...sample,externalKey:`pagination-${index}`,slug:`pagination-${index}`,
   title:`Тестовая статья ${index}`,order:index,category:'Компоненты',
  }));
  save();result=run();assert.equal(result.status,0,result.stderr);
  const readPage=name=>fs.readFileSync(path.join(temp,'pages',name),'utf8');
  assert.match(readPage('news.html'),/href="news-2\.html" aria-label="Следующая страница"/);
  assert.match(readPage('news-2.html'),/href="news-3\.html" aria-label="Следующая страница"/);
  assert.match(readPage('news-3.html'),/<span aria-current="page">3<\/span>/);
  assert.equal((readPage('news-3.html').match(/class="news-card"/g)||[]).length,1);
  assert.match(readPage('news-components-2.html'),/href="news-components-3\.html" aria-label="Следующая страница"/);
  snapshot.articles=[];snapshot.laboratoryPages=[];save();result=run();assert.equal(result.status,0,result.stderr);
  assert.deepEqual(fs.readdirSync(path.join(temp,'pages')).sort(),['catalog-sentinel.html','news.html']);
  assert.equal(fs.readFileSync(path.join(temp,'pages/catalog-sentinel.html'),'utf8'),sentinel);
  assert.match(fs.readFileSync(path.join(temp,'sitemap.xml'),'utf8'),/catalog-sentinel/);
 }finally{
  const resolved=path.resolve(temp);assert.equal(path.dirname(resolved),tempRoot);assert(path.basename(resolved).startsWith('ic-editorial-test-'));
  fs.rmSync(resolved,{recursive:true,force:true});
 }
});
