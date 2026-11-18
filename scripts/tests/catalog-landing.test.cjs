const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..');

test('Clearing CMS category content removes old fallback text in generated pages and legacy runtime',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ic-landing-check-'));
 try {
  for(const folder of ['scripts','templates','contracts']) fs.cpSync(path.join(ROOT,folder),path.join(dir,folder),{recursive:true});
  fs.mkdirSync(path.join(dir,'pages'));fs.mkdirSync(path.join(dir,'js'));
  fs.writeFileSync(path.join(dir,'sitemap.xml'),'<?xml version="1.0"?><urlset><url><loc>https://ic-farvater.ru/</loc></url></urlset>');
  for(const file of ['main.js','catalog-urls.js'])fs.copyFileSync(path.join(ROOT,'js',file),path.join(dir,'js',file));
  fs.copyFileSync(path.join(ROOT,'pages/product-detail.html'),path.join(dir,'pages/product-detail.html'));
  fs.symlinkSync(path.join(ROOT,'node_modules'),path.join(dir,'node_modules'),process.platform==='win32'?'junction':'dir');
  const record={slug:'microchips',name:'Микросхемы',source:'products',cardDesc:'Категория',subtitle:'Редакторский подзаголовок',description:'Описание редактора',image:'',bullets:[['Тип','Значение']],nomenclature:[['Новый тип','Новое значение']]};
  const others=['razemy','converters','capacitors','transistors','pcb','rantsy','snow'].map(slug=>({slug,name:slug,cardDesc:'Описание',source:'none'}));
  const generate=()=>{
   fs.writeFileSync(path.join(dir,'js/categories-data.js'),'const CATEGORIES='+JSON.stringify([record,...others])+';');
   const result=spawnSync(process.execPath,[path.join(dir,'scripts/generate-catalog-pages.mjs')],{encoding:'utf8'});
   assert.equal(result.status,0,result.stderr);
   return fs.readFileSync(path.join(dir,'pages/microchips.html'),'utf8');
  };
  let html=generate();assert.match(html,/Описание редактора/);assert.match(html,/Новое значение/);
  assert.equal((html.match(/class="pd-card"/g)||[]).length,3);
  assert.match(html,/data-pd-category="microchips"/);
  for(const slug of ['microchips',...others.map(c=>c.slug)]) {
   const page=fs.readFileSync(path.join(dir,'pages',slug+'.html'),'utf8');
   assert.match(page,/<body[^>]*data-pd-kind="landing"/);
   assert.match(page,/<span class="product-top__counter">\(01\)<\/span>/);
   assert.equal((page.match(/class="pd-card"/g)||[]).length,3,slug+': related count');
   assert.match(page,/<span class="pd-only-mobile">Запросить расчёт<\/span>/);
  }
  Object.assign(record,{subtitle:'',description:'',image:'',bullets:[],nomenclature:[]});
  html=generate();
  assert.match(html,/<p class="product-top__subtitle" hidden><\/p>/);
  assert.match(html,/<div class="pd-block pd-block--description" hidden>/);
  assert.match(html,/<div class="pd-block pd-block--bullets" id="pdBulletsBlock" hidden>/);
  assert.match(html,/<section class="section section--pd-nomenclature" id="pdNomenclatureSection" hidden>/);
  assert(!html.includes('Описание редактора'));assert(!html.includes('Новое значение'));
  assert(!html.includes('Поставляем цифровые и аналоговые интегральные'));
  const source=fs.readFileSync(path.join(ROOT,'js/main.js'),'utf8');
  const start=source.indexOf('if (CMS_CATS) {',source.indexOf('// ===== CMS-переопределение'));
  const end=source.indexOf('// ===== markdown-lite',start);
  assert(start>0&&end>start);
  const context={CMS_CATS:[record],CATEGORY_LANDINGS:{microchips:{name:'Старое',subtitle:'Старый подзаголовок',description:['Старый текст'],image:'old.webp',bullets:[['old','old']],nomenclature:[['old','old']]}},RELATED_CAT_INFO:{}};
  vm.runInNewContext(source.slice(start,end),context);
  assert.equal(context.CATEGORY_LANDINGS.microchips.description,'');assert.equal(context.CATEGORY_LANDINGS.microchips.subtitle,'');
  assert.equal(context.CATEGORY_LANDINGS.microchips.image,'');assert.equal(context.CATEGORY_LANDINGS.microchips.bullets.length,0);assert.equal(context.CATEGORY_LANDINGS.microchips.nomenclature.length,0);
  const again=generate();assert.equal(again,html);
  Object.assign(record,{subtitle:'<img src=x onerror=alert(1)>',description:'Безопасное описание',bullets:[['<script>','<img src=x>']],nomenclature:[['<iframe>','<svg onload=alert(1)>']]});
  html=generate();assert(!html.includes('<img src=x'));assert(!html.includes('<svg onload='));assert.match(html,/&lt;img src=x/);
 } finally {
  if(path.dirname(path.resolve(dir))!==path.resolve(os.tmpdir())||!path.basename(dir).startsWith('ic-landing-check-'))throw Error('Unexpected fixture path');
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
