const {test}=require('node:test'),assert=require('node:assert/strict');
const {servicesMarkup}=require('../render-home-services');
test('CMS services are added, reordered, removed and cleared without leaving fixed-index rows',()=>{
 const base={servicesTitle:'Услуги',servicesDesc:'Описание',servicesCTA:'Связаться',servicesItems:[{id:18,title:'Первая',intro:'Описание первой',bullet1:'Пункт'},{id:20,title:'Вторая',intro:'Описание второй'}]};
 const original=servicesMarkup(base,6);assert.equal((original.match(/class="accordion-item"/g)||[]).length,2);assert.match(original,/home-service-body-18/);assert.match(original,/aria-hidden="true" inert/);
 const changed=servicesMarkup({...base,servicesItems:[base.servicesItems[1],{id:21,title:'Новая'}]},5);assert.doesNotMatch(changed,/Первая|Описание первой|body-18/);assert.match(changed,/Вторая[\s\S]*Новая/);assert.match(changed,/\(05\)/);
 const empty=servicesMarkup({...base,servicesItems:[],servicesCTA:''});assert.doesNotMatch(empty,/class="accordion-item"|services-grid__cta|Первая|Вторая/);
 assert.throws(()=>servicesMarkup({...base,servicesItems:[{title:''}]}),/title required/);
});
