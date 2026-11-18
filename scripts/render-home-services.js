'use strict';
const fs=require('node:fs'),path=require('node:path');
const {inlineHtml}=require('./editorial-text'),{replaceRegion}=require('./render-home-hero');
const ROOT=process.env.FRONTEND_DIR||path.resolve(__dirname,'..');
const markers=['<!-- HOME:SERVICES:START -->','<!-- HOME:SERVICES:END -->'];
function servicesMarkup(homepage,counter=6){
 for(const key of ['servicesTitle','servicesDesc','servicesCTA','servicesItems'])if(!Object.hasOwn(homepage,key))throw Error('CMS homepage services field missing: '+key);
 if(homepage.servicesItems!=null&&!Array.isArray(homepage.servicesItems))throw Error('CMS homepage servicesItems must be an array or null');
 const text=value=>inlineHtml(value??'').replace(/\r?\n/g,'<br>');
 const items=(homepage.servicesItems||[]).map((item,index)=>{
  if(typeof item.title!=='string'||!item.title.trim())throw Error('Homepage service title required at index '+index);
  const key=Number.isInteger(item.id)&&item.id>0?item.id:index+1;
  const bullets=['bullet1','bullet2','bullet3'].map(k=>item[k]).filter(v=>v!=null&&String(v).trim()).map(v=>`<li>${text(v)}</li>`).join('');
  return `            <li class="accordion-item">
              <button type="button" class="accordion-item__head" aria-expanded="false" aria-controls="home-service-body-${key}"><span class="accordion-item__title">${text(item.title)}</span><span class="accordion-item__icon" aria-hidden="true">+</span></button>
              <div class="accordion-item__body" id="home-service-body-${key}" aria-hidden="true" inert>${item.intro?`<p>${text(item.intro)}</p>`:''}${bullets?`<ul class="accordion-item__bullets">${bullets}</ul>`:''}</div>
            </li>`;
 }).join('\n');
 return `    <section class="section section--services home-services" id="uslugi">
      <div class="container"><div class="services-grid">
        <div class="services-grid__head" data-animate="fade-up-stagger">
          <header class="section-head"><h2 class="section-head__title">${text(homepage.servicesTitle)}<span class="section-head__counter">(${String(counter).padStart(2,'0')})</span></h2></header>
          <p class="services-grid__desc">${text(homepage.servicesDesc)}</p>
          ${homepage.servicesCTA?`<a href="pages/contacts.html" class="btn-pill btn-pill--solid services-grid__cta">${text(homepage.servicesCTA)}</a>`:''}
        </div>
        <ul class="services-list accordion-list" data-accordion-group="services" data-animate="fade-up-stagger">
${items}
        </ul>
      </div></div>
    </section>`;
}
function renderHomeServices({homepage,counter,write}){
 const file=path.join(ROOT,'index.html'),before=fs.readFileSync(file,'utf8');
 const next=replaceRegion(before,markers,servicesMarkup(homepage,counter));
 if(write&&next!==before)fs.writeFileSync(file,next);
 console.log('[home-services]',JSON.stringify({changed:next!==before,write,items:homepage.servicesItems?.length||0}));
}
module.exports={servicesMarkup,renderHomeServices};
