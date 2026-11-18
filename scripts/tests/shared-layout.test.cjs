const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {renderSharedLayout,elementRange,SHELL}=require('../shared-layout');
const ROOT=path.resolve(__dirname,'../..');
const withoutCmsComments=html=>html.replace(/<!--\s*(?:cms:[\w.-]+|\/cms)\s*-->/g,'');
test('Footer form and legal CSS retain the pinned restored desktop/mobile declarations',()=>{
 const frozen=JSON.parse(fs.readFileSync(path.join(ROOT,'templates/frozen-footer-css.json'),'utf8'));
 const css=fs.readFileSync(path.join(ROOT,'css/components.css'),'utf8').replace(/\r\n/g,'\n');
 const rules=css.match(/\.footer__(?:newsletter|email-form|disclaimer|bottom|copyright|legal)[^{}]*\{[^{}]*\}/g);
 assert.deepEqual(rules,frozen.rules);
});
test('Shared footer keeps the accepted form markup and legal strip on every base page',()=>{
 for(const rel of ['index.html','pages/about.html','pages/products.html','pages/product-detail.html','pages/contacts.html','pages/privacy-policy.html','pages/consent.html']){
  const before=fs.readFileSync(path.join(ROOT,rel),'utf8').replace(/\r\n/g,'\n');
  const after=renderSharedLayout(before,rel,{root:ROOT});
  const oldFooter=before.match(SHELL.footer)[0],newFooter=after.match(SHELL.footer)[0];
  assert.equal(withoutCmsComments(elementRange(newFooter,'footer__newsletter').html),withoutCmsComments(elementRange(oldFooter,'footer__newsletter').html),rel+': frozen form');
  assert.equal(elementRange(newFooter,'footer__bottom').html,elementRange(oldFooter,'footer__bottom').html,rel+': legal strip');
  assert.equal(renderSharedLayout(after,rel,{root:ROOT}),after,rel+': repeated shell');
 }
});
