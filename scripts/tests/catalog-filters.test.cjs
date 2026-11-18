const {test}=require('node:test'),assert=require('node:assert/strict');
const {copy,choose,reset,count,urlForState,matchesQuery,selectItems}=require('../../js/catalog-filters');
const types=state=>state.cats.includes('razemy')?['вилка','розетка']:[];
test('Catalog selection is an isolated draft until explicitly committed',()=>{
 const applied={cat:'razemy',series:'et-2rm',seriesType:'вилка',app:'space',search:'ЕТ',view:'list'};
 let draft=choose(copy(applied),'cat','microchips',types);
 assert.deepEqual(applied,{cat:'razemy',series:'et-2rm',seriesType:'вилка',app:'space',search:'ЕТ',view:'list'});
 assert.equal(draft.series,null);assert.equal(draft.seriesType,'вилка');assert.equal(draft.app,'space');
 draft=choose(draft,'seriesType','розетка',types);assert.deepEqual(draft.types,['вилка','розетка']);
 Object.assign(applied,draft);assert.deepEqual(applied.cats,['razemy','microchips']);assert.equal(applied.view,'list');
});
test('Draft reset clears filters/search, preserves view, and leaves applied state untouched on cancellation',()=>{
 const applied={cat:'razemy',series:'et-2rm',seriesType:'вилка',app:'space',search:'ЕТ',view:'list'};
 const draft=reset(copy(applied));assert.equal(count(draft),0);assert.equal(draft.search,'');assert.equal(draft.view,'list');
 assert.equal(count(applied),3);assert.equal(applied.series,'et-2rm');
});
test('Catalog URL encodes the applied query/type/application/view while preserving unrelated campaign parameters',()=>{
 const state={cat:'razemy',series:'et-2rm',seriesType:'вилка',app:'space',search:'ЕТ + 14',view:'list'};
 const url=new URL(urlForState('https://example.test/pages/products.html?utm_source=mail&q=old',state),'https://example.test');
 assert.equal(url.searchParams.get('q'),'ЕТ + 14');assert.equal(url.searchParams.get('type'),'вилка');assert.equal(url.searchParams.get('application'),'space');assert.equal(url.hash,'#razemy/et-2rm');
 const cleared=new URL(urlForState(url.href,reset(state)),'https://example.test');
 assert.equal(cleared.searchParams.get('utm_source'),'mail');assert.equal(cleared.searchParams.get('view'),'list');
 for(const key of ['q','type','application'])assert.equal(cleared.searchParams.has(key),false);
 assert.equal(cleared.hash,'');
});
test('Search keeps Russian word-ending matching but never truncates numeric model codes',()=>{
 assert.equal(matchesQuery('ET1310PN1U','ЕТ1310'),true);
 assert.equal(matchesQuery('ET1309ES035','ЕТ1310'),false);
 assert.equal(matchesQuery('ET-2РМГ14Б4Ш1А2','ET-2РМГ14Б4Ш1А2'),true);
 assert.equal(matchesQuery('ET-2РМГ14Б4Ш1А3','ET-2РМГ14Б4Ш1А2'),false);
 assert.equal(matchesQuery('микросхемы цифровые','микросхема'),true);
 assert.equal(matchesQuery('разъёмы','разъем'),true);
});

const product={type:'product',id:1,cat:'microchips',name:'ET1310PN1U',apps:['telecom','radar'],desc:'Управление питанием'};
const series={type:'series',id:'snc23',cat:'razemy',name:'ЕТ-СНЦ23',apps:['telecom'],variantTypes:['вилка','розетка'],seriesTypes:new Set(['вилка','розетка'])};
const variants=[
 {type:'variant',id:'snc23:0',cat:'razemy',seriesSlug:'snc23',name:'ЕТ-СНЦ23-14Р',desc:'ТКЕС.434410.014 ТУ',apps:['telecom'],seriesTypes:new Set(['розетка']),position:1,href:'socket.html'},
 {type:'variant',id:'snc23:1',cat:'razemy',seriesSlug:'snc23',name:'ЕТ-СНЦ23-18В',desc:'ТКЕС.434410.014 ТУ',apps:['telecom'],seriesTypes:new Set(['вилка']),position:2,href:'fork.html'}
];
const landing={type:'landing',id:'cat-pcb',cat:'pcb',name:'Печатные платы',apps:['telecom','radar']};
const dataset={categorySlugs:['microchips','razemy','pcb'],getCategoryItems:cat=>({microchips:[product],razemy:[series],pcb:[]})[cat],getIndexedItems:()=>[product,series,...variants,landing],landingOnlyCats:{pcb:true}};
test('Application union returns each item once, retains landing-first order, and matches the single-application subset',()=>{
 const one=selectItems({...dataset,state:copy({apps:['telecom'],search:''})});
 const both=selectItems({...dataset,state:copy({apps:['telecom','radar'],search:''})});
 assert.deepEqual(one.map(x=>x.id),['cat-pcb',1,'snc23']);
 assert.deepEqual(both.map(x=>x.id),one.map(x=>x.id));
 assert.equal(new Set(both.map(x=>x.type+':'+x.id)).size,both.length);
 assert.equal(both.find(x=>x.type==='series').variantCount,2);
});
test('Search uses indexed variants inside a selected category and respects every selected type/application',()=>{
 const selected=copy({cats:['razemy'],types:['вилка'],apps:['telecom','radar'],search:'ЕТ-СНЦ23-18В'});
 const rows=selectItems({...dataset,state:selected});
 assert.deepEqual(rows.map(x=>[x.id,x.href,x.position]),[['snc23:1','fork.html',2]]);
 assert.equal(selectItems({...dataset,state:copy({...selected,apps:['radar']})}).length,0);
 assert.equal(selectItems({...dataset,state:copy({...selected,search:'ЕТ-СНЦ23-19В'})}).length,0);
 assert.equal(selectItems({...dataset,state:copy({...selected,cats:['microchips']})}).length,0);
});
test('A draft series selection controls variant totals without changing the applied state or indexed data',()=>{
 const applied=copy({cats:['razemy'],types:['вилка'],apps:['telecom'],search:''});
 const draft=choose(applied,'seriesType','розетка',()=>['вилка','розетка']);
 assert.equal(selectItems({...dataset,state:applied})[0].variantCount,1);
 assert.equal(selectItems({...dataset,state:draft})[0].variantCount,2);
 assert.deepEqual(applied.types,['вилка']);assert.equal(series.variantCount,undefined);
 const rows=selectItems({...dataset,state:copy({...applied,series:'snc23'})});
 assert.deepEqual(rows.map(x=>[x.id,x.position]),[['snc23:1',2]]);
 assert.equal(selectItems({...dataset,state:copy({...applied,series:'missing'})}).length,0);
});
