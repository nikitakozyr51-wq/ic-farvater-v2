const {test}=require('node:test'),assert=require('node:assert/strict');
const {heroMarkup,replaceRegion}=require('../render-home-hero');
test('Hero replacement preserves surrounding homepage sections and rejects ambiguous boundaries',()=>{
 const markers=['<!-- START -->','<!-- END -->'],source='keep-before<!-- START -->old<!-- END -->keep-after';
 assert.equal(replaceRegion(source,markers,'new'),'keep-before<!-- START -->\nnew\n  <!-- END -->keep-after');
 assert.throws(()=>replaceRegion(source+'<!-- END -->',markers,'new'),/Invalid/);
 assert.throws(()=>replaceRegion('no hero',markers,'new'),/Invalid/);
});
test('Hero content can be cleared and cannot inject markup outside its editable text',()=>{
 const cleared=heroMarkup({title:'',mobileTitle:'',description:null,cta:'',desktop:null,mobile:null});
 assert.doesNotMatch(cleared.markup,/<img|9CN77|Поставки ЭКБ/);assert.equal(cleared.preload,'');
 const rendered=heroMarkup({title:'Текст\n<script>bad()</script>',mobileTitle:'Текст',description:'Текст<br>Ещё текст',cta:'Подобрать',desktop:{url:'assets/images/cms/home/hero.webp',width:1774,height:887,formats:{}}});
 assert.match(rendered.markup,/Текст<br>/);assert.doesNotMatch(rendered.markup,/<script|bad\(\)/);
 const desktopSizes='(min-width: 1441px) 1440px, 100vw';
 assert.ok(rendered.markup.includes(` sizes="${desktopSizes}"`));
 assert.ok(rendered.preload.includes(` imagesizes="${desktopSizes}" media="(min-width:1024px)"`));
 assert.match(rendered.markup,/<source media="\(max-width:1023\.98px\)"[^>]+ sizes="100vw">/);
 assert.match(rendered.preload,/imagesizes="100vw" media="\(max-width:1023\.98px\)"/);
});
