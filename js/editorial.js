/* Native details keeps all content readable with JavaScript disabled. */
(() => {
 // The source laboratory interaction allows one open check per chapter, including all closed.
 document.querySelectorAll('[data-editorial-kind="laboratory-page"] .editorial-disclosures').forEach(group=>{
  const checks=[...group.querySelectorAll(':scope > details')];
  checks.forEach(check=>check.addEventListener('toggle',()=>{if(check.open)checks.forEach(other=>{if(other!==check)other.open=false;});}));
 });
 const revealCheck=hash=>{
  let target;try{target=document.getElementById(decodeURIComponent(hash.replace(/^#/,'')));}catch{return;}
  const check=target?.closest('[data-editorial-kind="laboratory-page"] .editorial-disclosure');
  if(!check)return;
  check.closest('.editorial-disclosures')?.querySelectorAll(':scope > details').forEach(other=>{if(other!==check)other.open=false;});check.open=true;
 };
 document.querySelectorAll('[data-editorial-kind="laboratory-page"] .editorial-toc a').forEach(link=>link.addEventListener('click',()=>revealCheck(link.hash)));
 window.addEventListener('hashchange',()=>revealCheck(window.location.hash));revealCheck(window.location.hash);
 const toc = document.querySelector('details.editorial-toc');
 if (!toc) return;
 const desktop = window.matchMedia('(min-width:1024px)');
 const ensureDesktopContents = () => { if (desktop.matches) toc.open = true; };
 desktop.addEventListener('change', ensureDesktopContents);
 ensureDesktopContents();
})();
