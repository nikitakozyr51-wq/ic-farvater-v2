/* Pencil idePk / LV8kx / tdyRm / qTiD7. One draft, one commit, no CMS writes. */
(function (root, factory) {
 const api = factory();
 if (typeof module === 'object' && module.exports) module.exports = api;
 else root.ICCatalogFilters = api;
})(typeof window === 'undefined' ? null : window, function () {
 'use strict';
 const HOMOGLYPH={a:'а',c:'с',e:'е',o:'о',p:'р',x:'х',y:'у',b:'в',h:'н',k:'к',m:'м',t:'т'};
 const normalize = text => String(text==null?'':text).toLowerCase().replace(/ё/g,'е').replace(/\u00a0/g,' ').split('').map(ch=>HOMOGLYPH[ch]||ch).join('');
 function matchesQuery(haystack,query) {
  if(!query)return true;
  const h=normalize(haystack),q=normalize(query);
  if(h.includes(q))return true;
  // A model code is not a Russian word ending: ET1310 must not expand to ET1309.
  if(/\d/.test(q))return false;
  return q.length>=5&&(h.includes(q.slice(0,-1))||h.includes(q.slice(0,-2)));
 }
 const unique = values => [...new Set(values.filter(value=>typeof value==='string'&&value&&value!=='all'))];
 const values = (state,key) => unique(Array.isArray(state[key])?state[key]:[state[{cats:'cat',types:'seriesType',apps:'app'}[key]]]);
 function copy(state) {
  const cats=values(state,'cats'),types=values(state,'types'),apps=values(state,'apps');
  return {...state,cats,types,apps,cat:cats.length===1?cats[0]:'all',series:cats.length===1?state.series||null:null,seriesType:types.length===1?types[0]:'all',app:apps.length===1?apps[0]:'all'};
 }
 function choose(draft, key, value, getTypes) {
  const next = copy(draft);
  const field={cat:'cats',seriesType:'types',app:'apps'}[key];if(!field)return next;
  next[field]=value==='all'?[]:next[field].includes(value)?next[field].filter(item=>item!==value):[...next[field],value];
  if(key==='cat')next.series=null;
  if(key==='cat'||key==='seriesType')next.types=next.types.filter(type=>getTypes(copy(next)).includes(type));
  return copy(next);
 }
 function reset(draft) { return copy({ ...draft, cats:[], types:[], apps:[], series:null, search:'' }); }
 const count = state => values(state,'cats').length+values(state,'types').length+values(state,'apps').length;
 function filterItems(items,state) {
  const cats=values(state,'cats'),types=values(state,'types'),apps=values(state,'apps');
  return items.filter(item=>(!cats.length||cats.includes(item.cat))
   &&(!types.length||types.some(type=>item.seriesTypes?.has(type)))
   &&(!apps.length||apps.some(app=>(item.apps||[]).includes(app)))
   &&matchesQuery(item.name+' '+(item.desc||''),String(state.search||'').trim()));
 }
 function selectItems({state,categorySlugs,getCategoryItems,getIndexedItems,landingOnlyCats={}}) {
  const chosen=copy(state),cats=chosen.cats.length?chosen.cats:categorySlugs;
  let indexed;
  const index=()=>indexed||(indexed=getIndexedItems());
  let items;
  if(chosen.series&&chosen.cats.length===1)items=index().filter(item=>item.type==='variant'&&item.cat===chosen.cat&&item.seriesSlug===chosen.series);
  else if(chosen.search.trim()&&!chosen.cats.length)items=index();
  else items=cats.flatMap(cat=>{
   let rows=getCategoryItems(cat);
   if(!rows.length&&landingOnlyCats[cat])rows=index().filter(item=>item.type==='landing'&&item.cat===cat);
   if(chosen.search.trim()) {
    const matched=rows.filter(item=>matchesQuery(item.name+' '+(item.desc||''),chosen.search.trim()));
    rows=matched.length?matched:index().filter(item=>item.type==='variant'&&item.cat===cat);
   }
   return rows;
  });
  items=filterItems(items,chosen).map(item=>item.type==='series'?{...item,variantCount:item.variantTypes.filter(type=>!chosen.types.length||chosen.types.includes(type)).length}:item);
  // Preserve the existing application overview: landing sections first, then CMS order.
  if(!chosen.cats.length&&!chosen.search.trim()&&chosen.apps.length)items=items.filter(item=>item.type==='landing').concat(items.filter(item=>item.type!=='landing'));
  return items;
 }
 function readUrl(href) {
  const url=new URL(href),[cat,series]=url.hash.slice(1).split('/');
  return copy({cats:cat&&cat!=='all'&&cat!=='search'?[cat]:unique(url.searchParams.getAll('category')),types:unique(url.searchParams.getAll('type')),apps:unique(url.searchParams.getAll('application')),series:series||null,search:url.searchParams.get('q')||'',view:url.searchParams.get('view')==='list'?'list':'grid'});
 }
 function urlForState(href,state) {
  const url=new URL(href),selected=copy(state);
  for(const [key,value] of [['q',selected.search.trim()],['view',selected.view==='list'?'list':'']]) {
   if(value)url.searchParams.set(key,value);else url.searchParams.delete(key);
  }
  for(const [key,items] of [['category',selected.cats.length>1?selected.cats:[]],['type',selected.types],['application',selected.apps]]){
   url.searchParams.delete(key);items.forEach(value=>url.searchParams.append(key,value));
  }
  url.hash=selected.cat==='all'?'':selected.cat+(selected.series?'/'+selected.series:'');
  return url.pathname+url.search+url.hash;
 }
 function mount({ state, categories, applications, appsReady, getTypes, getPreview, getResult = () => ({}), apply, beforeCommit = () => {} }) {
  const toolbar = document.querySelector('.catalog__toolbar');
  if (!toolbar || !window.ICDialogs) return { refresh() {} };
  const icons = {
   down:'<path d="m6 9 6 6 6-6"/>', right:'<path d="m9 6 6 6-6 6"/>',
   back:'<path d="m12 5-7 7 7 7M5 12h14"/>', close:'<path d="m6 6 12 12M18 6 6 18"/>',
   search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
   filters:'<path d="M3 6h7m4 0h7M3 12h11m4 0h3M3 18h3m4 0h11M10 3v6m4 0v6M6 15v6"/>',
  };
  const icon = name => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
  const node = (tag, className, text) => { const element = document.createElement(tag); element.className = className; if (text !== undefined) element.textContent = text; return element; };
  const button = (className, text, action) => { const element = node('button',className,text); element.type = 'button'; if(action) element.addEventListener('click',action); return element; };
  const catName = selected => values(selected,'cats').map(slug=>categories.find(cat=>cat.slug===slug)?.name||slug).join(', ')||'Все категории';
  const appName = selected => values(selected,'apps').map(slug=>applications.find(app=>app.slug===slug)?.name||slug).join(', ')||'Все области';
  const title = { all:'Фильтры', cat:'Категория', seriesType:'Тип', app:'Применение' };
  const lane = node('div','catalog-filters-lane'); lane.setAttribute('aria-label','Фильтры каталога');
  const triggers = {};
  for (const [key,label] of [['all','Фильтры'],['cat','Все категории'],['seriesType','Тип'],['app','Применение']]) {
   const trigger = button('catalog-filter-trigger', undefined, () => open(key,trigger));
   trigger.dataset.filter = key; trigger.setAttribute('aria-haspopup','dialog'); trigger.setAttribute('aria-controls','catalogFiltersDialog');
   trigger.setAttribute('aria-expanded','false');
   trigger.append(node('span','',label)); trigger.insertAdjacentHTML('beforeend',icon(key === 'all' ? 'filters' : 'down'));
   lane.append(trigger); triggers[key] = trigger;
  }
  toolbar.querySelector('.catalog__pills').hidden = true;
  toolbar.append(lane);
  const summary = node('div','catalog-filters-summary'); summary.hidden = true;
  const summaryLabel = node('span',''); summaryLabel.setAttribute('role','status');
  summary.append(summaryLabel,button('catalog-filters-summary__reset','Сбросить',()=>{ beforeCommit(); Object.assign(state,reset(state)); document.querySelectorAll('.catalog__search input').forEach(input=>{input.value='';}); apply(); }));
  toolbar.append(summary);
  const view=toolbar.querySelector('.catalog__view-toggle'), mobile=window.matchMedia('(max-width:1023.98px)');
  const resultHeader=node('div','catalog-results-header');resultHeader.hidden=true;
  const resultHeading=node('h2','catalog-results-header__heading');
  const resultName=document.createTextNode(''), resultLastWord=document.createTextNode('');
  const resultTail=node('span','catalog-results-header__heading-tail'), resultCount=node('span','catalog-results-header__count');
  resultTail.append(resultLastWord,'\u202f',resultCount);resultHeading.append(resultName,resultTail);resultHeader.append(resultHeading);
  document.querySelector('#catalogList').prepend(resultHeader);
  const overlay = node('div','catalog-filters'); overlay.id='catalogFiltersDialog'; overlay.hidden=true;
  overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true'); overlay.setAttribute('aria-labelledby','catalogFiltersTitle'); overlay.setAttribute('tabindex','-1');
  overlay.setAttribute('data-lenis-prevent','');
  const panel = node('div','catalog-filters__panel');
  const header = node('div','catalog-filters__header');
  const back = button('catalog-filters__back',undefined,goBack); back.innerHTML=icon('back'); back.setAttribute('aria-label','Назад');
  const heading = node('h2','catalog-filters__title'); heading.id='catalogFiltersTitle';
  const close = button('catalog-filters__close',undefined,()=>window.ICDialogs.close()); close.innerHTML=icon('close'); close.setAttribute('aria-label','Закрыть фильтры');
  header.append(back,heading,close);
  const content = node('div','catalog-filters__content');
  const footer = node('div','catalog-filters__footer');
  const applyButton=button('catalog-filters__apply','Показать результаты',()=>{
   if (!draft) return;
   beforeCommit(); Object.assign(state,draft); document.querySelectorAll('.catalog__search input').forEach(input=>{input.value=state.search;});
   apply(); window.ICDialogs.close();
  });footer.append(applyButton);
  panel.append(header,content,footer); overlay.append(panel); document.body.append(overlay);
  overlay.addEventListener('click',event=>{ if(event.target===overlay)window.ICDialogs.close(); });
  let draft=null, route='all';
  function updatePreview(){const preview=getPreview(draft);applyButton.textContent=`Показать результаты · ${preview.count}`;}
  function open(next,trigger) {
   draft=copy(state); route=next; render(); overlay.hidden=false;
   if (!overlay.classList.contains('catalog-filters--sheet')) overlay.classList.add('catalog-filters--entering');
   trigger.setAttribute('aria-expanded','true');
   window.ICDialogs.open({element:overlay,trigger,onClose:()=>{ overlay.hidden=true; draft=null; Object.values(triggers).forEach(b=>b.setAttribute('aria-expanded','false')); }});
  }
  function goBack() { if(route!=='all'){route='all';render();back.focus();}else window.ICDialogs.close(); }
  const checked=(key,value)=>{const selected=values(draft,{cat:'cats',seriesType:'types',app:'apps'}[key]);return value==='all'?!selected.length:selected.includes(value);};
  function option(label,key,value,group) {
   const choice=button('catalog-filter-option',undefined,()=>{
    draft=choose(draft,key,value,getTypes);
    group.querySelectorAll('[role="checkbox"]').forEach(option=>option.setAttribute('aria-checked',String(checked(key,option.dataset.value))));updatePreview();
   });
   choice.dataset.value=value;choice.setAttribute('role','checkbox');choice.setAttribute('aria-checked',String(checked(key,value)));
   choice.append(node('span','catalog-filter-option__marker'),node('span','catalog-filter-option__label',label));
   group.append(choice);
  }
  function render() {
   overlay.classList.remove('catalog-filters--entering');
   heading.textContent=title[route]; content.replaceChildren();
   const sheet=route==='app'||route==='seriesType'; overlay.classList.toggle('catalog-filters--sheet',sheet);
   back.hidden=false;updatePreview();
   if(route==='seriesType'&&draft.cat==='razemy')heading.textContent='Тип разъёма';
   if(route==='all') {
    for(const [key,value] of [['cat',catName(draft)],['seriesType',values(draft,'types').join(', ')||'Все типы'],['app',appName(draft)]]) {
     const row=button('catalog-filter-row',undefined,()=>{route=key;render();back.focus();});
     const label=node('span','catalog-filter-row__label',title[key]),selected=values(draft,{cat:'cats',seriesType:'types',app:'apps'}[key]);
     row.setAttribute('aria-label',[title[key],selected.length?`выбрано ${selected.length}`:'',value].filter(Boolean).join(', '));
     if(selected.length)label.append(node('span','catalog-filter-row__count',String(selected.length)));
     row.append(label,node('span','catalog-filter-row__value',value));row.insertAdjacentHTML('beforeend',icon('right'));content.append(row);
    }
    // UsOuU is an unapproved proposal. Preserve the existing CMS order until D07 is resolved.
    const sorting=node('div','catalog-filter-row'); sorting.setAttribute('aria-disabled','true');
    sorting.append(node('span','catalog-filter-row__label','Сортировка'),node('span','catalog-filter-row__value','По умолчанию'));content.append(sorting);
    content.append(button('catalog-filters__reset','Сбросить фильтры',()=>{draft=reset(draft);render();}));
    return;
   }
   const optionValues=route==='cat'?[['all','Все категории'],...categories.map(cat=>[cat.slug,cat.name])]
    :route==='app'?[['all','Все области'],...(appsReady?applications.map(app=>[app.slug,app.name]):[])]
    :[['all','Все типы'],...getTypes(draft).map(type=>[type,type.charAt(0).toUpperCase()+type.slice(1)])];
   let search;
   if(route==='cat') {
    const field=node('div','catalog-filters__search'); search=node('input','');search.type='search';search.placeholder='Найти категорию';search.setAttribute('aria-label','Найти категорию');field.append(search);field.insertAdjacentHTML('beforeend',icon('search'));content.append(field);
   }
   const group=node('div','catalog-filter-options');group.setAttribute('role','group');group.setAttribute('aria-label',heading.textContent);
   optionValues.forEach(([value,label])=>option(label,route,value,group));content.append(group);
   if(route==='app'&&!appsReady)content.append(node('p','catalog-filters__hint','Подбор по применению пока недоступен. Выберите категорию.'));
   if(route==='seriesType'&&optionValues.length===1)content.append(node('p','catalog-filters__hint','Для этого раздела отдельные типы не заданы.'));
   group.addEventListener('keydown',event=>{
    if(!['ArrowDown','ArrowUp','ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
    const options=[...group.querySelectorAll('[role="checkbox"]')].filter(option=>!option.hidden);if(!options.length)return;
    const index=options.indexOf(document.activeElement);const next=event.key==='Home'?0:event.key==='End'?options.length-1:(index+(['ArrowDown','ArrowRight'].includes(event.key)?1:-1)+options.length)%options.length;
    event.preventDefault();options[next].focus();
   });
   search?.addEventListener('input',()=>{
    const query=search.value.toLocaleLowerCase('ru').replace(/ё/g,'е').trim();
    group.querySelectorAll('[role="checkbox"]').forEach(option=>{option.hidden=!option.textContent.toLocaleLowerCase('ru').replace(/ё/g,'е').includes(query);});
    let empty=content.querySelector('.catalog-filters__empty');
    if(!empty){empty=node('p','catalog-filters__empty','Категории не найдены');empty.setAttribute('role','status');content.append(empty);}
    empty.hidden=[...group.children].some(option=>!option.hidden);
   });
  }
  function refresh() {
   const selected=copy(state);triggers.cat.querySelector('span').textContent=selected.cats.length>1?`Категории (${selected.cats.length})`:catName(selected);
   for(const [key,items] of [['cat',selected.cats],['seriesType',selected.types],['app',selected.apps]])triggers[key].classList.toggle('catalog-filter-trigger--selected',!!items.length);
   const active=count(state); summary.hidden=active<2&&!selected.types.length&&!selected.apps.length;summaryLabel.textContent=`Выбрано ${active} ${active%10===1&&active%100!==11?'значение':active%10>=2&&active%10<=4&&(active%100<12||active%100>14)?'значения':'значений'}`;
   const hasResults=document.body.classList.contains('is-catalog-results');resultHeader.hidden=!mobile.matches||!hasResults;
   if(mobile.matches&&hasResults)resultHeader.append(view);else toolbar.insertBefore(view,lane);
   const result=getResult(), label=result.label||catName(state);
   const split=label.lastIndexOf(' ')+1;
   resultName.data=label.slice(0,split);resultLastWord.data=label.slice(split);
   resultCount.textContent=`(${result.count||0})`;
  }
  window.matchMedia('(min-width:1024px)').addEventListener('change',event=>{
   const activeHref=document.activeElement?.closest('#catalogListGrid a')?.getAttribute('href');
   if(event.matches&&window.ICDialogs.isActive(overlay)) {
    window.ICDialogs.close({restoreFocus:false});
    document.querySelector('.catalog__sidebar .filter-group__header')?.focus({preventScroll:true});
   }
   apply();
   if(activeHref)[...document.querySelectorAll('#catalogListGrid a')].find(link=>link.getAttribute('href')===activeHref)?.focus({preventScroll:true});
  });
  refresh();return {refresh};
 }
 return { copy, choose, reset, count, values, filterItems, selectItems, readUrl, urlForState, normalize, matchesQuery, mount };
});
