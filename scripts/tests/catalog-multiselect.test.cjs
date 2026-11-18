const {test}=require('node:test'),assert=require('node:assert/strict');
const {copy,choose,reset,count,urlForState,readUrl,filterItems}=require('../../js/catalog-filters');
const types=state=>!state.cats.length||state.cats.includes('razemy')?['вилка','розетка']:[];
const initial=()=>copy({cat:'razemy',series:'et-2rm',seriesType:'вилка',app:'space',search:'ЕТ',view:'list'});
test('Adding a category retains the previous category and compatible type in an isolated draft',()=>{
 const applied=initial(),before=JSON.stringify(applied),draft=choose(applied,'cat','microchips',types);
 assert.deepEqual(draft.cats,['razemy','microchips']);assert.deepEqual(draft.types,['вилка']);assert.equal(draft.series,null);
 assert.equal(JSON.stringify(applied),before);assert.equal(count(draft),4);
});
test('Deselecting a category clears only incompatible types; All clears only its own group',()=>{
 let draft=choose(initial(),'cat','microchips',types);draft=choose(draft,'cat','razemy',types);
 assert.deepEqual(draft.cats,['microchips']);assert.deepEqual(draft.types,[]);assert.deepEqual(draft.apps,['space']);
 draft=choose(draft,'cat','all',types);assert.deepEqual(draft.cats,[]);assert.deepEqual(draft.apps,['space']);
});
test('Types and applications allow independent multiple toggles, including deselection',()=>{
 let draft=choose(initial(),'seriesType','розетка',types);draft=choose(draft,'app','telecom',types);
 assert.deepEqual(draft.types,['вилка','розетка']);assert.deepEqual(draft.apps,['space','telecom']);
 draft=choose(draft,'seriesType','вилка',types);assert.deepEqual(draft.types,['розетка']);
 draft=choose(draft,'app','all',types);assert.deepEqual(draft.apps,[]);assert.deepEqual(draft.types,['розетка']);
});
test('Cancel/reset cannot mutate applied arrays; reset clears filters/query while retaining view',()=>{
 const applied=initial(),draft=copy(applied);draft.cats.push('microchips');draft.apps.splice(0);
 assert.deepEqual(applied.cats,['razemy']);assert.deepEqual(applied.apps,['space']);
 const cleared=reset(draft);assert.equal(count(cleared),0);assert.equal(cleared.search,'');assert.equal(cleared.view,'list');assert.equal(count(applied),3);
});
test('Multiple categories/types/applications round-trip as repeated URL parameters without losing campaign parameters',()=>{
 let selected=choose(initial(),'cat','microchips',types);selected=choose(selected,'seriesType','розетка',types);selected=choose(selected,'app','telecom',types);
 const href='https://example.test/pages/products.html?utm_source=mail&q=old',url=new URL(urlForState(href,selected),href),restored=readUrl(url.href);
 for(const key of ['cats','types','apps'])assert.deepEqual(restored[key],selected[key]);
 assert.equal(url.searchParams.get('utm_source'),'mail');assert.equal(url.hash,'');assert.equal(restored.view,'list');assert.equal(restored.search,'ЕТ');
 const cleared=new URL(urlForState(url.href,reset(selected)),href);
 for(const key of ['category','type','application','q'])assert.equal(cleared.searchParams.has(key),false);
 assert.equal(cleared.searchParams.get('utm_source'),'mail');assert.equal(cleared.searchParams.get('view'),'list');
});
test('Legacy links remain readable; duplicate and All query values are normalized',()=>{
 const state=readUrl('https://example.test/pages/products.html?type=вилка&application=space#razemy/et-2rm');
 assert.equal(state.cat,'razemy');assert.equal(state.series,'et-2rm');assert.deepEqual(state.types,['вилка']);assert.deepEqual(state.apps,['space']);
 assert.equal(new URL(urlForState('https://example.test/pages/products.html',state),'https://example.test').hash,'#razemy/et-2rm');
 assert.deepEqual(readUrl('https://example.test/pages/products.html?category=razemy&category=razemy&category=all').cats,['razemy']);
});
test('Filtering uses OR within a group and AND between groups, without duplicating overlapping matches',()=>{
 const items=[{id:'a',cat:'microchips',name:'A1',apps:['telecom']},{id:'b',cat:'razemy',name:'B1',apps:['radar','telecom'],seriesTypes:new Set(['вилка'])},{id:'c',cat:'razemy',name:'C1',apps:['space'],seriesTypes:new Set(['розетка'])},{id:'d',cat:'converters',name:'D1',apps:['telecom'],seriesTypes:new Set(['вилка'])}];
 const selected=copy({cats:['microchips','razemy'],types:['вилка','розетка'],apps:['telecom','space'],search:'',view:'grid'});
 assert.deepEqual(filterItems(items,selected).map(x=>x.id),['b','c']);assert.deepEqual(filterItems(items,{...selected,apps:['space']}).map(x=>x.id),['c']);
 assert.deepEqual(filterItems(items,{...selected,search:'B1'}).map(x=>x.id),['b']);assert.equal(filterItems(items,{...selected,apps:['missing']}).length,0);
});
