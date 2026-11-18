const { test }=require('node:test'),assert=require('node:assert/strict');
const {replaceOwnedUrls}=require('../sitemap');
test('Catalog and editorial generators preserve each other and remain stable across alternating runs',()=>{
 const initial='<?xml version="1.0"?><urlset><url><loc>https://ic-farvater.ru/</loc></url></urlset>';
 const catalog=new Set(['https://ic-farvater.ru/pages/product.html']),editorial=new Set(['https://ic-farvater.ru/pages/article-one.html']);
 const cat=['<url><loc>https://ic-farvater.ru/pages/product.html</loc></url>'],article=['<url><loc>https://ic-farvater.ru/pages/article-one.html</loc></url>'];
 let xml=replaceOwnedUrls(replaceOwnedUrls(initial,catalog,cat),editorial,article);
 assert.equal(replaceOwnedUrls(replaceOwnedUrls(xml,catalog,cat),editorial,article),xml);
 const cleared=replaceOwnedUrls(xml,editorial,[]);assert.match(cleared,/product.html/);assert.doesNotMatch(cleared,/article-one/);
});
