import { contexts, outputs, renderOutput } from './content.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const state = {phase:0,context:'door',output:'translation',language:'fi',audioLanguage:'fi',campaign:'social',hotspot:'path',motion:!reduced.matches};
let scene;

function pauseMedia(){ $$('audio,video').forEach((media)=>media.pause()); }
function announce(text){ $('#status').textContent=text; }
function renderContext(){
  const item=contexts[state.context];
  $('#context-detail').innerHTML=`<p class="context-kind">${esc(item.kind)}</p><h3 class="context-name">${esc(item.name)}</h3><blockquote class="context-quote">”${esc(item.quote)}”</blockquote><p class="quote-source">Ovi muurissa · osa ${esc(item.part)} · lähdekatkelma</p><p class="context-description">${esc(item.description)}</p><p class="context-carry"><strong>Säilyy mukana</strong>${esc(item.carry)}</p><p class="context-nuance">${esc(item.nuance)}</p>`;
}
function renderCurrentOutput(){pauseMedia();$('#output-detail').innerHTML=renderOutput(state.output,state);}
function go(phase,{focus=false}={}){
  pauseMedia();state.phase=phase;document.body.dataset.phase=String(phase);$('#hero-art').setAttribute('aria-hidden',String(phase!==0));$('.scene-hint').hidden=phase===0;
  for(let i=0;i<3;i++) $(`#act-${i}`).hidden=i!==phase;
  $$('.act-rail [data-go]').forEach(button=>{if(Number(button.dataset.go)===phase) button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
  scene?.setPhase(phase);scene?.setSelected(phase===1?state.context:state.output);
  if(phase===1)renderContext();if(phase===2)renderCurrentOutput();
  announce(['Käsikirjoitus. Teksti on vasta alku.','Konteksti. Valitse henkilö, paikka tai merkitys verkosta.','Mahdollisuudet. Valitse tarinalle uusi muoto verkosta.'][phase]);
  if(focus){const selectedId=phase===1?state.context:state.output;const node=phase>0?$(`#scene-host [data-node="${selectedId}"]`):null;const target=node||$(`#act-${phase} h${phase===0?'1':'2'}`);if(!node)target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}
  window.scrollTo({top:0,behavior:state.motion?'smooth':'instant'});
}
function selectNode(id){
  if(state.phase===1&&contexts[id]){state.context=id;renderContext();announce(`${contexts[id].name}. ${contexts[id].description}`);}
  if(state.phase===2&&outputs[id]){state.output=id;renderCurrentOutput();announce(`${outputs[id].label}. ${outputs[id].title}`);}
  scene?.setSelected(id);
}
function setMotion(enabled){
  state.motion=enabled;document.body.classList.toggle('is-still',!enabled);scene?.setMotion(enabled);
  const button=$('#motion-toggle');button.setAttribute('aria-pressed',String(!enabled));button.setAttribute('aria-label',enabled?'Pysäytä liike':'Käynnistä liike');button.innerHTML=enabled?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 10 7-10 7Z"/></svg>';
}
document.addEventListener('click',(event)=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.go!==undefined)go(Number(button.dataset.go),{focus:!button.closest('.act-rail')});
  if(button.dataset.context){state.context=button.dataset.context;go(1,{focus:true});}
  const changes=[['language','language'],['audioLanguage','audioLanguage'],['campaign','campaign'],['world','hotspot']];
  for(const [attribute,key]of changes)if(button.dataset[attribute]){state[key]=button.dataset[attribute];renderCurrentOutput();const selector=`button[data-${attribute.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}="${button.dataset[attribute]}"]`;$('#output-detail').querySelector(selector)?.focus({preventScroll:true});announce('Esimerkki päivitetty.');}
});
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

renderContext();renderCurrentOutput();setMotion(state.motion);
// The semantic demo stays usable even if WebGL or the optional rendering module fails.
import('./scene.js').then(({createScene})=>{scene=createScene($('#scene-host'),{onNodeSelect:selectNode});scene.setMotion(state.motion);scene.setPhase(state.phase);scene.setSelected(state.phase===1?state.context:state.output);}).catch(()=>{
  const host=$('#scene-host');host.classList.add('simple-scene');
  const renderFallback=()=>{const focused=host.contains(document.activeElement)?document.activeElement.dataset.node:null;const items=state.phase===1?contexts:outputs;host.innerHTML=state.phase===0?'':Object.entries(items).map(([id,item])=>`<button class="fallback-node" data-node="${id}" aria-pressed="${id===(state.phase===1?state.context:state.output)}">${esc(item.name||item.label)}</button>`).join('');if(focused)host.querySelector(`[data-node="${focused}"]`)?.focus({preventScroll:true});};
  host.addEventListener('click',event=>{const node=event.target.closest('[data-node]');if(node){selectNode(node.dataset.node);renderFallback();}});
  scene={setPhase:renderFallback,setSelected:renderFallback,setMotion:()=>{}};renderFallback();
});
