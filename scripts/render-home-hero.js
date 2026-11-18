'use strict';
const fs=require('node:fs'),path=require('node:path');
const {inlineHtml,escape:esc}=require('./editorial-text');
const ROOT=process.env.FRONTEND_DIR||path.resolve(__dirname,'..');
const MARKERS={hero:['<!-- HOME:HERO:START -->','<!-- HOME:HERO:END -->'],preload:['<!-- HOME:HERO:PRELOAD:START -->','<!-- HOME:HERO:PRELOAD:END -->']};
function replaceRegion(html,markers,content){
 const start=html.indexOf(markers[0]),end=html.indexOf(markers[1]);
 if(start<0||end<=start||html.indexOf(markers[0],start+1)>=0||html.indexOf(markers[1],end+1)>=0)throw Error('Invalid homepage hero boundaries');
 return html.slice(0,start+markers[0].length)+'\n'+content+'\n  '+html.slice(end);
}
const text=value=>inlineHtml(value??'').replace(/\r?\n/g,'<br>');
function heroMarkup(data){
 const sourceSet=media=>Object.values(media?.formats||{}).concat(media||[]).filter(f=>f.url&&f.width).sort((a,b)=>a.width-b.width).filter((f,i,a)=>i===a.findIndex(g=>g.width===f.width)).map(f=>`${f.url} ${f.width}w`).join(', ');
 const desktop=data.desktop,mobile=data.mobile||desktop;
 const alt=data.alt??data.mobileAlt??'',mobileAlt=data.mobileAlt??alt;
 const picture=desktop ? `<picture class="hero__bg" data-desktop-alt="${esc(alt)}" data-mobile-alt="${esc(mobileAlt)}"${alt||mobileAlt?'':' aria-hidden="true"'}>${mobile?`<source media="(max-width:1023.98px)" srcset="${esc(sourceSet(mobile))}" sizes="100vw">`:''}<img width="${desktop.width}" height="${desktop.height}" src="${esc(desktop.url)}" srcset="${esc(sourceSet(desktop))}" sizes="100vw" alt="${esc(alt)}" fetchpriority="high" decoding="async"></picture>` : '';
 const markup=`    <section class="hero hero--pencil" data-header-theme="dark">
      ${picture}
      <div class="container hero__inner">
        <div class="hero__text hero__text--entry">
          <h1 class="hero__title"><span class="hero__title--desktop"><!-- cms:homepage.heroTitle -->${text(data.title)}<!-- /cms --></span><span class="hero__title--mobile"><!-- cms:homepage.heroTitleMobile -->${text(data.mobileTitle)}<!-- /cms --></span></h1>
          <p class="hero__sub"><!-- cms:homepage.heroSubtitle -->${text(data.description)}<!-- /cms --></p>
          <a href="pages/products.html" class="hero__cta"><span><!-- cms:homepage.heroCTA -->${text(data.cta)}<!-- /cms --></span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 7h10v10M7 17 17 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
        </div>
      </div>
    </section>`;
 const preload=(media,condition)=>media?`  <link rel="preload" as="image" href="${esc(media.url)}" imagesrcset="${esc(sourceSet(media))}" imagesizes="100vw" media="${condition}" fetchpriority="high">`:'';
 return {markup,preload:[preload(desktop,'(min-width:1024px)'),preload(mobile,'(max-width:1023.98px)')].filter(Boolean).join('\n')};
}
async function renderHomeHero({homepage,api,write}){
 for(const key of ['heroTitle','heroTitleMobile','heroSubtitle','heroCTA','heroBackground','heroBackgroundMobile','heroBackgroundAlt','heroBackgroundMobileAlt'])if(!Object.hasOwn(homepage,key))throw Error('CMS homepage hero field missing: '+key);
 if(!homepage.heroBackground && homepage.heroBackgroundMobile)throw Error('Mobile hero requires a primary image; clear both images or choose a primary image');
 async function cache(file){
  if(!file)return null;
  if(!Number.isInteger(file.width)||!Number.isInteger(file.height)||file.width<1||file.height<1||file.width>30000||file.height>30000)throw Error('Invalid hero media dimensions');
  const name=String(file.hash+file.ext);if(!/^[a-zA-Z0-9_-]+\.(webp|png|jpe?g|avif)$/i.test(name)||!file.width||!file.height)throw Error('Invalid hero media');
  const url='assets/images/cms/home/'+name;await api.media(file.url,path.join(ROOT,url),{write});
  const formats={};for(const [key,f]of Object.entries(file.formats||{}))formats[key]=await cache({...f,ext:f.ext||file.ext,formats:{}});
  return {url,width:file.width,height:file.height,formats};
 }
 const data={version:1,title:homepage.heroTitle,mobileTitle:homepage.heroTitleMobile,description:homepage.heroSubtitle,cta:homepage.heroCTA,alt:homepage.heroBackgroundAlt,mobileAlt:homepage.heroBackgroundMobileAlt,desktop:await cache(homepage.heroBackground),mobile:await cache(homepage.heroBackgroundMobile)};
 const content=heroMarkup(data),file=path.join(ROOT,'index.html'),old=fs.readFileSync(file,'utf8');
 let next=replaceRegion(replaceRegion(old,MARKERS.hero,content.markup),MARKERS.preload,content.preload);
 if(!next.includes('css/home.min.css'))next=next.replace('</head>','  <link rel="stylesheet" href="css/home.min.css">\n</head>');
 if(write){if(next!==old)fs.writeFileSync(file,next);fs.mkdirSync(path.join(ROOT,'content'),{recursive:true});fs.writeFileSync(path.join(ROOT,'content/homepage-hero.json'),JSON.stringify(data,null,2)+'\n');}
 console.log('[home-hero]',JSON.stringify({changed:next!==old,write,desktopImage:Boolean(data.desktop),mobileImage:Boolean(data.mobile)}));
}
module.exports={heroMarkup,replaceRegion,renderHomeHero};
