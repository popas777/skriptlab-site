import { contexts, outputs, renderOutput } from './content.js';
import { contextPresentations } from './context-presentations.js';
import { outputPresentations } from './output-presentations.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arrow = '<svg viewBox="0 0 32 24" aria-hidden="true"><path d="M2 12h27M22 5l7 7-7 7"/></svg>';
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const state = {phase:0,detail:false,context:'door',output:'translation',language:'fi',audioLanguage:'fi',campaign:'social',hotspot:'path',motion:!reduced.matches,theme:'dark'};
let scene;
try { if (localStorage.getItem('skriptlab-demo3-theme') === 'light') state.theme = 'light'; } catch { /* A theme switch also works without browser storage. */ }

function pauseMedia(){ $$('audio,video').forEach(media => media.pause()); }
function announce(text){ $('#status').textContent = text; }
function presentationHeader(kind,title,lead){
  return `<button type="button" class="back-button" data-overview>${arrow}<span>Takaisin karttaan</span></button><p class="presentation-kind">${esc(kind)}</p><h2 class="presentation-title" tabindex="-1">${esc(title)}</h2><p class="presentation-lead">${esc(lead)}</p>`;
}
function presentationBody(item){
  return `<div class="presentation-body"><figure class="presentation-figure"><img class="presentation-image" src="${esc(item.image)}" width="1536" height="1024" alt="${esc(item.alt)}" decoding="async"><figcaption>${esc(item.caption)}</figcaption></figure><div class="presentation-sections">${item.sections.map(section=>`<section><h3>${esc(section.title)}</h3><p>${esc(section.text)}</p></section>`).join('')}</div></div>`;
}
function renderContext(){
  const base=contexts[state.context], item=contextPresentations[state.context];
  $('#context-detail').innerHTML = `${presentationHeader(base.kind,base.name,item.lead)}${presentationBody(item)}<figure class="source-quote"><blockquote>”${esc(base.quote)}”</blockquote><figcaption>Ovi muurissa · osa ${esc(base.part)} · lähdekatkelma</figcaption></figure><section class="application-section"><h3>Kontekstista mahdollisuuksiin</h3><div class="application-links">${item.applications.map(link=>`<button type="button" data-output="${esc(link.id)}"><span><strong>${esc(link.label)}</strong><span>${esc(link.reason)}</span></span>${arrow}</button>`).join('')}</div></section>`;
}
function renderCurrentOutput({sampleOnly=false}={}){
  pauseMedia();
  if(sampleOnly){$('#output-detail .sample-section').innerHTML=renderOutput(state.output,state);return;}
  const base=outputs[state.output],item=outputPresentations[state.output];
  $('#output-detail').innerHTML=`${presentationHeader(base.label,base.title,item.lead)}${presentationBody(item)}<section class="sample-section">${renderOutput(state.output,state)}</section><section class="process-section"><h3>Näin konteksti ohjaa tekemistä</h3><ol>${item.process.map(step=>`<li><h4>${esc(step.title)}</h4><p>${esc(step.text)}</p></li>`).join('')}</ol></section>`;
}
function focusHeading(){
  const target=state.detail?$(`#act-${state.phase} .presentation-title`):$(`#act-${state.phase} h${state.phase===0?'1':'2'}`);
  target?.setAttribute('tabindex','-1');target?.focus({preventScroll:true});
}
function updateLayout(){
  document.body.dataset.phase=String(state.phase);
  document.body.dataset.detail=String(state.detail);
  $('#hero-art').setAttribute('aria-hidden',String(state.phase!==0));
  $('#map-title').textContent=state.phase===1?'Tutki kontekstia':'Tutki mahdollisuuksia';
  for(let i=0;i<3;i++) $(`#act-${i}`).hidden=i!==state.phase;
  $$('.act-rail [data-go]').forEach(button=>{if(Number(button.dataset.go)===state.phase)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
  scene?.setPhase(state.phase);
  scene?.setCompact(state.detail);
  scene?.setSelected(state.detail?(state.phase===1?state.context:state.output):null);
}
function scrollTop(){window.scrollTo({top:0,behavior:state.motion?'smooth':'instant'});}
function go(phase,{focus=true}={}){
  pauseMedia();state.phase=phase;state.detail=false;updateLayout();
  announce(['Käsikirjoitus. Teksti on vasta alku.','Konteksti. Valitse henkilö, paikka tai merkitys kartalta.','Mahdollisuudet. Valitse tarinalle uusi muoto kartalta.'][phase]);
  if(focus)focusHeading();scrollTop();
}
function selectNode(id){
  pauseMedia();
  if(state.phase===1&&Object.hasOwn(contexts,id)){state.context=id;renderContext();announce(`${contexts[id].name}. Kuvallinen esittely avattu.`);}
  else if(state.phase===2&&Object.hasOwn(outputs,id)){state.output=id;renderCurrentOutput();announce(`${outputs[id].label}. Kuvallinen esittely avattu.`);}
  else return;
  state.detail=true;updateLayout();focusHeading();scrollTop();
}
function overview(){
  pauseMedia();state.detail=false;updateLayout();
  const id=state.phase===1?state.context:state.output;
  $(`#scene-host [data-node="${id}"]`)?.focus({preventScroll:true});
  announce('Kartta suurennettu. Valitse kohde avataksesi esittelyn.');scrollTop();
}
function setTheme(theme){
  state.theme=theme;document.documentElement.dataset.theme=theme;
  $('meta[name="theme-color"]').content=theme==='light'?'#f5f3ed':'#08120f';
  $('#hero-art img').src=theme==='light'?'/demo3/assets/story-world-light.webp':'/demo3/assets/story-world.webp';
  const button=$('#theme-toggle');button.setAttribute('aria-pressed',String(theme==='light'));button.setAttribute('aria-label',theme==='light'?'Vaihda tummaan teemaan':'Vaihda vaaleaan teemaan');
  button.innerHTML=theme==='light'?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.1A8.5 8.5 0 0 1 9.9 3.5a8.5 8.5 0 1 0 10.6 10.6Z"/></svg><span>Tumma</span>':'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/></svg><span>Vaalea</span>';
  scene?.setTheme(theme);
  try{localStorage.setItem('skriptlab-demo3-theme',theme);}catch{/* Optional preference persistence. */}
}
function setMotion(enabled){
  state.motion=enabled;document.body.classList.toggle('is-still',!enabled);scene?.setMotion(enabled);
  const button=$('#motion-toggle');button.setAttribute('aria-pressed',String(!enabled));button.setAttribute('aria-label',enabled?'Pysäytä liike':'Käynnistä liike');button.innerHTML=enabled?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 10 7-10 7Z"/></svg>';
}
document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.go!==undefined)go(Number(button.dataset.go));
  if(button.hasAttribute('data-overview'))overview();
  if(button.dataset.context){state.phase=1;selectNode(button.dataset.context);}
  if(button.dataset.output){state.phase=2;selectNode(button.dataset.output);}
  const changes=[['language','language'],['audioLanguage','audioLanguage'],['campaign','campaign'],['world','hotspot']];
  for(const [attribute,key]of changes)if(button.dataset[attribute]){
    const value=button.dataset[attribute];state[key]=value;renderCurrentOutput({sampleOnly:true});
    const selector=`button[data-${attribute.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}="${value}"]`;
    $('#output-detail').querySelector(selector)?.focus({preventScroll:true});announce('Esimerkki päivitetty.');
  }
});
$('#theme-toggle').addEventListener('click',()=>{setTheme(state.theme==='dark'?'light':'dark');announce(state.theme==='light'?'Vaalea teema käytössä.':'Tumma teema käytössä.');});
$('#motion-toggle').addEventListener('click',()=>setMotion(!state.motion));
reduced.addEventListener('change',()=>setMotion(!reduced.matches));
const dialog=$('#about-dialog');
$('#about-open').addEventListener('click',()=>{pauseMedia();dialog.showModal();scene?.setMotion(false);});
$('#about-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
dialog.addEventListener('close',()=>scene?.setMotion(state.motion));
document.addEventListener('visibilitychange',()=>{document.body.classList.toggle('is-background',document.hidden);if(document.hidden)pauseMedia();});
window.addEventListener('pagehide',pauseMedia);
const visual=$('#visual');
visual.addEventListener('pointermove',event=>{if(!state.motion||state.phase!==0||event.pointerType==='touch')return;const rect=visual.getBoundingClientRect();const x=(event.clientX-rect.left)/rect.width-.5;const y=(event.clientY-rect.top)/rect.height-.5;$('#hero-art').style.transform=`rotateY(${x*8}deg) rotateX(${-y*5}deg) translate3d(${x*7}px,${y*7}px,0)`;});
visual.addEventListener('pointerleave',()=>{$('#hero-art').style.transform='';});
setTheme(state.theme);setMotion(state.motion);updateLayout();
// The semantic presentations remain usable without WebGL or the optional scene module.
import('./scene.js').then(({createScene})=>{
  scene=createScene($('#scene-host'),{onNodeSelect:selectNode});scene.setTheme(state.theme);scene.setMotion(state.motion);updateLayout();
}).catch(()=>{
  const host=$('#scene-host');host.classList.add('simple-scene');
  const renderFallback=()=>{
    const focused=host.contains(document.activeElement)?document.activeElement.dataset.node:null;
    const items=state.phase===1?contexts:outputs;
    host.innerHTML=state.phase===0?'':Object.entries(items).map(([id,item])=>`<button type="button" class="fallback-node" data-node="${id}" aria-pressed="${state.detail&&id===(state.phase===1?state.context:state.output)}">${esc(item.name||item.label)}</button>`).join('');
    if(focused)host.querySelector(`[data-node="${focused}"]`)?.focus({preventScroll:true});
  };
  host.addEventListener('click',event=>{const node=event.target.closest('[data-node]');if(node)selectNode(node.dataset.node);});
  scene={setPhase:renderFallback,setSelected:renderFallback,setMotion:()=>{},setTheme:()=>{},setCompact:()=>{}};renderFallback();
});
