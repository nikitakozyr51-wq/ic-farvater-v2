const {test}=require('node:test'),assert=require('node:assert/strict');
const {renderTextPhoto,renderCategorySlider}=require('../render-home-blocks');
const {heroMarkup}=require('../render-home-hero');
test('Homepage media keeps editor alt, separate mobile source and valid crop without accepting injected attributes',()=>{
 const source={title:'О компании',body:'Текст',photo:{width:1152,height:928,alternativeText:'Описание файла'},mobilePhoto:{alternativeText:'Мобильное описание'},photoAlt:'',photoCaption:'Подпись <script>bad()</script>',focalX:30,mobileFocalY:65};
 const html=renderTextPhoto(source,'02','assets/company.webp','assets/company-mobile.webp');
 assert.match(html,/srcset="assets\/company-mobile.webp"/);assert.match(html,/alt=""/);assert.match(html,/--photo-x:30%/);assert.match(html,/--mobile-photo-y:65%/);assert.match(html,/<figcaption[^>]*>Подпись &lt;script&gt;/);assert.doesNotMatch(html,/<script/);
 assert.throws(()=>renderTextPhoto({...source,focalX:'0;display:none'},'02','a.webp'),/Invalid homepage image focal/);
 const hero=heroMarkup({title:'Текст',mobileTitle:'Текст',desktop:{url:'assets/hero.webp',width:1440,height:720},alt:'',mobileAlt:'Мобильное описание'}).markup;
 assert.match(hero,/data-desktop-alt="" data-mobile-alt="Мобильное описание"/);assert.doesNotMatch(hero,/<picture[^>]*aria-hidden="true"/);
});
test('Missing category links or unavailable slider cards stop generation instead of silently removing a homepage section',()=>{
 assert.throws(()=>renderCategorySlider({title:'Разъёмы'},'01',{categories:[]}),/category is missing/);
 assert.throws(()=>renderCategorySlider({category:{slug:'razemy'}},'01',{categories:[{slug:'razemy',source:'connectors'}],connectors:[]}),/no available cards/);
});
