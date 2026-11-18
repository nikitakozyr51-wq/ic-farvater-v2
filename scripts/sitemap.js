'use strict';
function replaceOwnedUrls(xml, owned, entries) {
 const normalized=xml.replace(/\r\n/g,'\n'), match=normalized.match(/^([\s\S]*?<urlset\b[^>]*>)([\s\S]*?)<\/urlset>\s*$/);
 if(!match)throw Error('Invalid sitemap envelope');
 const blocks=match[2].match(/<url>[\s\S]*?<\/url>/g)||[];
 if(match[2].replace(/<url>[\s\S]*?<\/url>/g,'').trim())throw Error('Unexpected sitemap content');
 const location=block=>{const value=block.match(/<loc>([^<]+)<\/loc>/)?.[1];if(!value)throw Error('Missing sitemap location');return value;};
 const all=blocks.filter(block=>!owned.has(location(block))).concat(entries);
 const seen=new Set();for(const block of all){const loc=location(block);if(seen.has(loc))throw Error('Duplicate sitemap URL');seen.add(loc);}
 all.sort((a,b)=>location(a).localeCompare(location(b),'en'));
 return match[1]+'\n'+all.map(block=>'  '+block.trim()).join('\n')+'\n</urlset>\n';
}
module.exports={replaceOwnedUrls};
