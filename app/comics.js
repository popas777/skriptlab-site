const $ = id => document.getElementById(id);
const el = (tag, text = '', className = '') => { const n = document.createElement(tag); n.textContent = text; if (className) n.className = className; return n; };
const id = () => crypto.randomUUID();
const clone = value => JSON.parse(JSON.stringify(value));
const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const state = { projectId: null, revision: 0, manifest: null, pageId: null, panelId: null, textId: null, canEdit: false, busy: false, dirty: false, conflict: false, epoch: 0, edit: 0, preview: 0, saving: null, undo: [], assets: [], urls: new Map(), styles: [], draft: null, imageRequest: null };
let saveTimer, previewTimer;
const page = () => state.manifest?.pages.find(p => p.id === state.pageId);
const panel = () => page()?.panels.find(p => p.id === state.panelId);
const lettering = () => panel()?.lettering.find(t => t.id === state.textId);
const path = suffix => `/api/projects/${state.projectId}/comics${suffix || ''}`;
const payload = body => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const storageKey = projectId => `skriptlab_comics_draft:${state.userId}:${projectId}`;
const localSnapshot = () => ({ revision: state.revision, manifest: state.manifest, dirty: state.dirty });

function notice(message = '', error = false) { $('notice').hidden = !message; $('notice').textContent = message; $('notice').dataset.error = String(error); }
function saveLabel(message) { $('save-status').textContent = message; }
async function api(url, options = {}, binary = false) {
  const response = await window.SkriptLabAuth.fetch(url, options);
  if (!response.ok) {
    const data = await response.json().catch(() => ({})); const d = data.detail;
    const message = Array.isArray(d) ? d.map(x => x.msg).join(' ') : typeof d === 'object' ? d?.message : d;
    const error = new Error(message || `Pyyntö epäonnistui (${response.status}).`); error.status = response.status; throw error;
  }
  return binary ? response.blob() : response.json();
}
function stash() {
  if (!state.projectId || !state.manifest || !state.canEdit || !state.userId) return;
  try { localStorage.setItem(storageKey(state.projectId), JSON.stringify(localSnapshot())); }
  catch { notice('Selaimen varatallennus ei onnistunut. Tallenna palvelimelle tai lataa JSON-kopio ennen näkymän sulkemista.', true); }
}
function checkpoint() { if (state.manifest) { state.undo.push(clone(state.manifest)); if (state.undo.length > 20) state.undo.shift(); } }
function changed() {
  state.dirty = true; state.edit++; stash(); saveLabel('Tallentamattomia muutoksia'); controls(); schedulePreview();
  clearTimeout(saveTimer); if (!state.conflict) saveTimer = setTimeout(() => save().catch(() => {}), 900);
}
function mutate(fn) { if (!state.canEdit || state.busy) return; checkpoint(); fn(); changed(); render(); }
function controls() {
  const locked = state.busy || !state.manifest;
  document.querySelectorAll('input,textarea,select,button').forEach(n => {
    if (n.dataset.close || n.closest('#preview')) return;
    n.disabled = locked || !state.canEdit;
  });
  ['panel-prev','panel-next','open-export','open-settings'].forEach(name => { $(name).disabled = locked || !page(); });
  document.querySelectorAll('[data-page],[data-tab],[data-export],#lettering-list button').forEach(n => { n.disabled = locked; });
  $('draft-export').disabled = locked;
  $('reload-server').disabled = locked;
  $('save').disabled = locked || !state.canEdit || !state.dirty || state.conflict;
  $('undo').disabled = locked || !state.canEdit || !state.undo.length;
  $('generate-image').disabled = locked || !state.canEdit || !panel()?.beat.trim() || !$('image-model').value;
  $('add-panel').disabled = locked || !state.canEdit || !page() || page().panels.length >= 12;
  $('delete-panel').disabled = locked || !state.canEdit || !page() || page().panels.length <= 4;
  $('add-text').disabled = locked || !state.canEdit || !panel() || panel().lettering.length >= 8;
  $('draft-page').disabled = locked || !state.canEdit || $('source-text').value.trim().length < 20;
  $('accept-draft').disabled = locked || !state.canEdit || !state.draft;
  $('start').disabled = locked || !state.canEdit;
  if (!page()) $('open-settings').disabled = locked;
}
async function save() {
  clearTimeout(saveTimer);
  if (state.saving) { await state.saving; if (state.dirty && !state.conflict) return save(); return; }
  if (!state.dirty || !state.canEdit) return;
  if (state.conflict) throw new Error('Ratkaise tallennusristiriita ensin. Oma JSON-kopio on ladattavissa.');
  const epoch = state.epoch, edit = state.edit, sent = clone(state.manifest), target = path(''), revision = state.revision, cacheKey = storageKey(state.projectId);
  saveLabel('Tallennetaan…');
  const promise = (async () => {
    try {
      const result = await api(target, { method: 'PUT', ...payload({ base_revision: revision, manifest: sent }) });
      if (epoch !== state.epoch) {
        // A project switch must not leave a successfully saved old draft
        // looking like a conflict when that project is reopened.
        try { const cached=JSON.parse(localStorage.getItem(cacheKey)||'null');if(cached?.revision===revision){cached.revision=result.revision;cached.dirty=JSON.stringify(cached.manifest)!==JSON.stringify(sent);localStorage.setItem(cacheKey,JSON.stringify(cached));} } catch { /* Existing local copy remains intact. */ }
        return;
      }
      state.revision = result.revision; state.dirty = state.edit !== edit; stash();
      saveLabel(state.dirty ? 'Tallentamattomia muutoksia' : 'Tallennettu projektiin');
    } catch (error) {
      if (epoch !== state.epoch) return;
      if (error.status === 409) state.conflict = true;
      saveLabel('Tallennus kesken'); stash(); notice(error.message || 'Tallennus epäonnistui. Yritä Tallenna-painikkeella uudelleen.', true); throw error;
    } finally { if (epoch === state.epoch) { state.saving = null; controls(); } }
  })();
  state.saving = promise; await promise;
}
async function run(action) {
  if (state.busy) return;
  state.busy = true; controls(); const epoch = state.epoch;
  try { await action(epoch); }
  catch (error) { if (epoch === state.epoch) notice(error.message || 'Yhteys katkesi. Tarkista tallennustila ennen jatkamista.', true); }
  finally { if (epoch === state.epoch) { state.busy = false; controls(); } }
}
async function loadProject(projectId, discard = false) {
  stash(); clearTimeout(saveTimer); clearTimeout(previewTimer);
  state.epoch++; const epoch = state.epoch;
  state.userId = window.SkriptLabAuth.getUser()?.id;
  state.projectId = projectId; state.manifest = null; state.canEdit = false; state.busy = true; state.dirty = false; state.conflict = false; state.saving = null; state.undo = []; state.draft = null; state.imageRequest = null; state.assets = [];
  for (const url of state.urls.values()) URL.revokeObjectURL(url); state.urls.clear();
  document.querySelectorAll('dialog[open]').forEach(d => d.close()); $('preview').replaceChildren(); $('draft-result').hidden = true;
  notice(); render(); saveLabel(projectId ? 'Ladataan…' : 'Ei projektia');
  if (!projectId) { state.busy = false; controls(); return; }
  try {
    const result = await api(path('')); if (epoch !== state.epoch) return;
    state.manifest = result.manifest; state.revision = result.revision; state.canEdit = result.can_edit; state.styles = result.styles; state.characterContext = result.character_context || '';
    if (state.canEdit && !discard) {
      try {
        const cached = JSON.parse(localStorage.getItem(storageKey(projectId)) || 'null');
        if (cached?.dirty && cached.manifest?.schema_version === 1 && Array.isArray(cached.manifest.pages)) {
          state.manifest = cached.manifest; state.dirty = true;
          state.conflict = cached.revision !== result.revision;
          notice(state.conflict ? 'Palvelimella on uudempi versio. Omat muutoksesi palautettiin selaimesta. Lataa oma JSON-kopio ja valitse sitten palvelimen versio Lataa-valikosta.' : 'Tallentamattomat muutokset palautettiin selaimesta. Tallenna ne projektiin.', state.conflict);
        }
      } catch { notice('Selaimen luonnosta ei voitu lukea. Palvelimelle tallennettu sarjakuva avattiin.', true); }
    }
    $('chapter-select').replaceChildren(new Option('Oma teksti tai katkelma', ''), ...result.chapters.map(c => new Option(c.title, c.id)));
    $('image-model').replaceChildren(...result.image_models.map(m => new Option(m.name, m.id)));
    if (!result.image_models.length) $('image-model').append(new Option('Ei käytettävissä olevaa kuvamallia', ''));
    state.pageId = state.manifest.pages[0]?.id || null; state.panelId = page()?.panels[0]?.id || null; state.textId = null;
    saveLabel(state.dirty ? 'Tallentamattomia muutoksia' : state.canEdit ? 'Tallennettu projektiin' : 'Lukuoikeus');
    state.busy = false; render(); renderStyles(); schedulePreview(0); loadAssets().catch(() => {});
    if (discard) stash();
  } catch (error) { if (epoch === state.epoch) { notice(error.message, true); saveLabel('Lataus epäonnistui'); } }
  finally { if (epoch === state.epoch) { state.busy = false; controls(); } }
}

function render() {
  const pages = state.manifest?.pages || [];
  $('empty').hidden = !!pages.length; $('editor').hidden = !pages.length;
  $('project-title').textContent = state.manifest?.title || 'Valitse projekti SkriptLabista.';
  $('page-list').replaceChildren(...pages.map((p, i) => {
    const button = el('button', '', 'page-card'); button.dataset.page = p.id; button.setAttribute('aria-current', String(p.id === state.pageId));
    const mini = el('span', '', 'mini-panels'); for (const _ of p.panels) mini.append(el('span'));
    button.append(mini, el('span', `Sivu ${i + 1}`), el('strong', p.title));
    button.addEventListener('click', () => { state.pageId = p.id; state.panelId = p.panels[0].id; state.textId = null; render(); schedulePreview(0); }); return button;
  }));
  if (page()) {
    $('page-title').value = page().title; $('layout').value = page().layout; $('gutter').value = page().gutter;
    if (!panel()) state.panelId = page().panels[0]?.id;
    renderInspector();
  }
  controls();
}
function setTab(name) {
  document.querySelectorAll('[data-tab]').forEach(b => { b.setAttribute('aria-selected', String(b.dataset.tab === name)); b.tabIndex = b.dataset.tab === name ? 0 : -1; });
  ['image','text','scene'].forEach(key => { $(`${key}-controls`).hidden = key !== name; });
}
function renderInspector() {
  const p = panel(); if (!p) return;
  $('panel-title').textContent = `Ruutu ${page().panels.indexOf(p) + 1} / ${page().panels.length}`;
  for (const [name,key] of [['beat','beat'],['camera','camera'],['image-prompt','image_prompt'],['fit','fit'],['focus-x','focus_x'],['focus-y','focus_y']]) $(name).value = p[key];
  $('continuity').value = page().continuity; $('source-label').textContent = page().source_label; $('source-excerpt').textContent = page().source_text || 'Sivulle ei ole liitetty lähdekatkelmaa.';
  const history = [...new Set([...(p.asset_history || []), p.asset_id].filter(Boolean))];
  $('image-history').replaceChildren(new Option('Ei kuvaa', ''), ...history.map((value,i) => new Option(`Kuvaversio ${i+1}`, value)));
  $('image-history').value = p.asset_id || '';
  $('reference-image').replaceChildren(new Option('Ei erillistä mallikuvaa',''), ...state.assets.map(a => new Option(a.title, a.id)));
  $('reference-image').value = p.reference_asset_id || '';
  if (!lettering()) state.textId = p.lettering[0]?.id || null;
  renderTexts(); highlight();
}
function renderTexts() {
  $('lettering-list').replaceChildren(...(panel()?.lettering || []).map((t,i) => {
    const b = el('button', `${i+1}. ${t.text || 'Uusi puhekupla'}`, 'text-chip'); b.setAttribute('aria-pressed', String(t.id === state.textId));
    b.onclick = () => { state.textId = t.id; renderTexts(); controls(); }; return b;
  }));
  const t = lettering(); $('lettering-editor').hidden = !t; if (!t) return;
  for (const [name,key] of [['lettering-text','text'],['lettering-kind','kind'],['speaker','speaker'],['font-size','font_size'],['text-x','x'],['text-y','y'],['text-w','w'],['text-h','h']]) $(name).value = t[key];
  $('font-value').textContent = `${t.font_size} pt`;
  $('text-x').max = 100-t.w; $('text-y').max = 100-t.h;
  $('text-w').max = 100-t.x; $('text-h').max = 100-t.y;
}
function highlight() { $('preview').querySelectorAll('[data-panel-id]').forEach(g => g.classList.toggle('selected',g.dataset.panelId === state.panelId)); }
async function assetURL(assetId) {
  if (state.urls.has(assetId)) return state.urls.get(assetId);
  const epoch = state.epoch, blob = await api(path(`/assets/${assetId}`), {}, true);
  if (epoch !== state.epoch) throw new Error('Projekti vaihtui.');
  if (state.urls.has(assetId)) return state.urls.get(assetId);
  const url = URL.createObjectURL(blob); state.urls.set(assetId,url); return url;
}
function schedulePreview(delay = 300) {
  clearTimeout(previewTimer); state.preview++;
  if (page()) { $('preview-status').textContent = 'Päivitetään esikatselua…'; previewTimer = setTimeout(preview, delay); }
}
async function preview() {
  if (!page()) return;
  const epoch = state.epoch, serial = state.preview, pageId = state.pageId;
  $('preview').setAttribute('aria-busy','true');
  try {
    const result = await api(path(`/preview/${encodeURIComponent(pageId)}`), { method:'POST', ...payload({base_revision:state.revision,manifest:state.manifest}) });
    if (epoch !== state.epoch || serial !== state.preview) return;
    const svg = new DOMParser().parseFromString(result.svg, 'image/svg+xml').documentElement;
    if (svg.nodeName !== 'svg') throw new Error('Sivun esikatselu ei latautunut.');
    await Promise.all([...svg.querySelectorAll('image')].map(async img => { const ref = img.getAttribute('href'); if (ref?.startsWith('comic-asset:')) img.setAttribute('href',await assetURL(Number(ref.split(':')[1]))); }));
    if (epoch !== state.epoch || serial !== state.preview) return;
    $('preview').replaceChildren(document.importNode(svg,true));
    const missing=result.warnings.filter(w=>w.includes('kuva puuttuu')).length;
    const warnings=result.warnings.filter(w=>!w.includes('kuva puuttuu'));
    if(missing)warnings.unshift(`${missing} ${missing===1?'ruutu odottaa':'ruutua odottaa'} kuvaa.`);
    $('warnings').replaceChildren(...warnings.map(w => el('li',w))); $('preview-status').textContent = 'Esikatselu ajan tasalla'; highlight();
  } catch (error) { if (epoch === state.epoch && serial === state.preview) $('preview-status').textContent = `Esikatselua ei päivitetty: ${error.message}`; }
  finally { if (epoch === state.epoch && serial === state.preview) $('preview').setAttribute('aria-busy','false'); }
}
function renderStyles() {
  const palettes = {clear:['#d6e5d5','#efdba5','#2d5441'],watercolor:['#e1e4d6','#e6b6a0','#7e9486'],manga:['#ececea','#c7c9c5','#232826'],noir:['#263733','#79857b','#e0e6d5'],adventure:['#b6d9cb','#e8aa66','#224d3d']};
  $('style-list').replaceChildren(...state.styles.map(s => {
    const b=el('button','','style-card'); b.setAttribute('aria-pressed',String(s.id===state.manifest.style)); b.title=s.description;
    const colors=palettes[s.id];
    b.innerHTML=`<svg viewBox="0 0 100 85" aria-hidden="true"><rect width="100" height="85" fill="${colors[0]}"/><circle cx="76" cy="23" r="11" fill="${colors[1]}"/><path d="M0 63 28 30 48 56 69 42 100 70V85H0Z" fill="${colors[2]}" opacity=".65"/><path d="M42 85 Q45 55 55 54 Q67 57 68 85M49 52Q37 35 49 29 Q66 24 64 42Q63 55 49 52" fill="${colors[1]}" stroke="${colors[2]}" stroke-width="2"/><path d="M0 76Q27 63 42 77M71 77Q91 66 100 71" fill="none" stroke="${colors[2]}"/></svg>`;
    b.append(el('span',s.name),el('small',s.description)); b.onclick=()=>{ mutate(()=>{state.manifest.style=s.id;}); renderStyles(); }; return b;
  })); controls();
}
function openSettings() { if (!state.manifest) return; for (const [name,key] of [['comic-title','title'],['style-notes','style_notes'],['adaptation','adaptation'],['characters','characters']]) $(name).value=state.manifest[key]; renderStyles(); $('settings-dialog').showModal(); controls(); }
function openPage() { if ((state.manifest?.pages.length || 0)>=150) { notice('Sarjakuvaan mahtuu enintään 150 sivua.',true); return; } state.draft=null; $('draft-result').hidden=true; $('page-dialog').showModal(); controls(); }
const newPanel = () => ({id:id(),beat:'',camera:'',image_prompt:'',asset_id:null,asset_history:[],reference_asset_id:null,fit:'cover',focus_x:50,focus_y:50,lettering:[]});
function addPage(p) { mutate(()=>{state.manifest.pages.push(p);state.pageId=p.id;state.panelId=p.panels[0].id;state.textId=null;}); $('page-dialog').close(); schedulePreview(0); }
function blankPage() { addPage({id:id(),title:`Sivu ${state.manifest.pages.length+1}`,source_label:$('chapter-select').selectedOptions[0]?.textContent || 'Oma teksti',source_text:$('source-text').value,source_checksum:'',chapter_id:$('chapter-select').value,continuity:'',layout:'grid',gutter:3,panels:Array.from({length:Number($('panel-count').value)},newPanel)}); }
async function draftPage() { await run(async epoch=>{
  notice('Luodaan sivukäsikirjoitusta…');
  const result=await api(path('/draft'),{method:'POST',...payload({source_text:$('source-text').value,source_label:$('chapter-select').selectedOptions[0]?.textContent || 'Oma teksti',chapter_id:$('chapter-select').value,panel_count:Number($('panel-count').value),instructions:[$('draft-instructions').value,state.manifest.adaptation].filter(Boolean).join('\n').slice(0,2000),characters:state.manifest.characters})});
  if(epoch!==state.epoch)return; state.draft=result.page; $('draft-content').replaceChildren(...result.page.panels.map((p,i)=>{const item=el('article','','draft-card');item.append(el('h4',`Ruutu ${i+1}`),el('p',p.beat),el('p',p.lettering.map(t=>`${t.speaker ? t.speaker+': ' : ''}${t.text}`).join('\n')));return item;}));$('draft-result').hidden=false;notice(result.note);$('draft-result').scrollIntoView({block:'nearest'});
}); }
function attachAsset(asset) { const p=panel(); if (!p)return; if(p.asset_id && !p.asset_history.includes(p.asset_id))p.asset_history.push(p.asset_id); if(!p.asset_history.includes(asset.id))p.asset_history.push(asset.id); p.asset_id=asset.id; }
async function loadAssets() { const epoch=state.epoch; const assets=await api(path('/assets')); if(epoch===state.epoch){state.assets=assets;if(panel())renderInspector();controls();} }
async function chooseImage() { $('assets-dialog').showModal(); await run(async epoch=>{await loadAssets();if(epoch!==state.epoch)return;const cards=state.assets.map(a=>{const b=el('button','','asset-card'),img=el('img');img.alt=a.title;img.loading='lazy';assetURL(a.id).then(url=>{if(epoch===state.epoch)img.src=url;}).catch(()=>{});b.append(img,el('span',a.title));b.onclick=()=>{mutate(()=>attachAsset(a));$('assets-dialog').close();};return b;});$('asset-list').replaceChildren(...(cards.length?cards:[el('p','Projektissa ei vielä ole kuvia. Tuo kuva tai luo ruudulle kuvitus.')]));}); }
async function uploadImage(file) { if(!file)return;await run(async epoch=>{if(file.size>12000000)throw new Error('Kuvan enimmäiskoko on 12 Mt.'); const data=new FormData();data.append('file',file);const result=await api(path('/assets'),{method:'POST',body:data});if(epoch!==state.epoch)return;checkpoint();attachAsset(result);changed();render();notice(`Kuva lisätty · ${result.width} × ${result.height} px`);await loadAssets();});$('image-file').value=''; }
async function generateImage() { await run(async epoch=>{
  await save();if(epoch!==state.epoch)return;const p=panel(),currentPage=page();
  const key=JSON.stringify([state.projectId,state.revision,currentPage.id,p.id,$('image-model').value]);
  if(state.imageRequest?.key!==key)state.imageRequest={key,id:id()};
  notice('Luodaan yhtä ruutukuvaa. Tämä voi kestää muutaman minuutin.');
  const result=await api(path('/image'),{method:'POST',...payload({client_request_id:state.imageRequest.id,base_revision:state.revision,page_id:currentPage.id,panel_id:p.id,model:$('image-model').value})});
  if(epoch!==state.epoch)return;checkpoint();attachAsset(result);state.imageRequest=null;changed();render();await save();notice('Uusi kuvaversio lisätty. Aiempi kuva löytyy Kuvaversio-valikosta.');await loadAssets();
}); }
function download(blob,name) { const url=URL.createObjectURL(blob);const a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000); }
async function exportFile(kind) { if(kind==='json'){download(new Blob([JSON.stringify(state.manifest,null,2)],{type:'application/json'}),'sarjakuva.json');return;}await run(async epoch=>{await save();if(epoch!==state.epoch)return;const query=new URLSearchParams({draft:String($('draft-export').checked)});if(kind==='svg')query.set('page_id',state.pageId);const blob=await api(path(`/export/${kind}?${query}`),{},true);if(epoch!==state.epoch)return;download(blob,`sarjakuva.${kind}`);notice('Tiedosto on valmis ladattavaksi.');}); }
function bind(name, target, key, number=false) {
  $(name).addEventListener('focus',()=>{if(state.canEdit&&!state.busy)checkpoint();});
  $(name).addEventListener('input',()=>{if(!state.canEdit||state.busy)return;const obj=target();if(!obj)return;obj[key]=number?Number($(name).value):$(name).value;
    if(target===lettering){const t=lettering();t.x=Math.min(t.x,100-t.w);t.y=Math.min(t.y,100-t.h);$('font-value').textContent=`${t.font_size} pt`;$('text-x').max=100-t.w;$('text-y').max=100-t.h;$('text-w').max=100-t.x;$('text-h').max=100-t.y;}
    if(name==='lettering-text') { const selected=$('lettering-list').querySelector('[aria-pressed="true"]');if(selected)selected.textContent=`${panel().lettering.indexOf(lettering())+1}. ${obj[key]||'Uusi puhekupla'}`; }
    if(name==='page-title') { const selected=$('page-list').querySelector('[aria-current="true"] strong');if(selected)selected.textContent=obj[key]; }
    if(name==='comic-title')$('project-title').textContent=obj[key];
    changed();
  });
}
function init() {
  $('start').onclick=openPage;$('add-page').onclick=openPage;$('blank-page').onclick=blankPage;$('draft-page').onclick=draftPage;$('accept-draft').onclick=()=>{if(state.draft)addPage(clone(state.draft));};
  $('open-settings').onclick=openSettings;$('open-export').onclick=()=>{$('export-dialog').showModal();controls();};
  $('use-context').onclick=()=>{if(!state.characterContext){notice('Projektin kontekstimuistissa ei vielä ole hahmo- tai paikkakuvauksia. Voit kirjoittaa ne itse.',true);return;}if(state.manifest.characters&&!window.confirm('Korvataanko nykyinen hahmo-ohje kontekstimuistin kuvauksilla?'))return;mutate(()=>{state.manifest.characters=state.characterContext;});$('characters').value=state.manifest.characters;notice('Kontekstimuistin kuvaukset lisätty. Tarkista ulkonäkö ja paljastusjärjestys ennen kuvittamista.');};
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
  document.querySelectorAll('[data-tab]').forEach(b=>{b.onclick=()=>setTab(b.dataset.tab);b.onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const tabs=['image','text','scene'];const n=(tabs.indexOf(b.dataset.tab)+(e.key==='ArrowRight'?1:2))%3;setTab(tabs[n]);$(`tab-${tabs[n]}`).focus();};});
  document.querySelectorAll('[data-export]').forEach(b=>b.onclick=()=>exportFile(b.dataset.export));
  $('save').onclick=()=>run(()=>save());$('undo').onclick=()=>{if(!state.undo.length)return;state.manifest=state.undo.pop();if(!page())state.pageId=state.manifest.pages[0]?.id;changed();render();};
  $('reload-server').onclick=()=>{if(!state.dirty||window.confirm('Korvataanko tämän selaimen muutokset palvelimen versiolla? Lataa ensin JSON-kopio, jos haluat säilyttää ne.'))loadProject(state.projectId,true);};
  $('page-up').onclick=()=>mutate(()=>{const list=state.manifest.pages,i=list.indexOf(page());if(i>0)[list[i-1],list[i]]=[list[i],list[i-1]];});
  $('page-down').onclick=()=>mutate(()=>{const list=state.manifest.pages,i=list.indexOf(page());if(i<list.length-1)[list[i+1],list[i]]=[list[i],list[i+1]];});
  $('delete-page').onclick=()=>{if(!window.confirm('Poistetaanko tämä sivu sarjakuvasta? Voit palauttaa sen Kumoa-painikkeella.'))return;mutate(()=>{state.manifest.pages=state.manifest.pages.filter(p=>p.id!==state.pageId);state.pageId=state.manifest.pages[0]?.id;state.panelId=page()?.panels[0]?.id;});};
  $('add-panel').onclick=()=>mutate(()=>{const p=newPanel();page().panels.push(p);state.panelId=p.id;});
  $('delete-panel').onclick=()=>{if(page().panels.length<=4)return;mutate(()=>{page().panels=page().panels.filter(p=>p.id!==state.panelId);state.panelId=page().panels[0].id;});};
  for(const [name,step] of [['panel-prev',-1],['panel-next',1]])$(name).onclick=()=>{const list=page().panels;state.panelId=list[(list.indexOf(panel())+step+list.length)%list.length].id;state.textId=null;renderInspector();controls();};
  for(const [name,step] of [['move-panel-left',-1],['move-panel-right',1]])$(name).onclick=()=>mutate(()=>{const list=page().panels,i=list.indexOf(panel()),n=i+step;if(n>=0&&n<list.length)[list[i],list[n]]=[list[n],list[i]];});
  $('add-text').onclick=()=>mutate(()=>{const t={id:id(),kind:'speech',speaker:'',text:'',x:5,y:5,w:80,h:30,font_size:11};panel().lettering.push(t);state.textId=t.id;});
  $('delete-text').onclick=()=>mutate(()=>{panel().lettering=panel().lettering.filter(t=>t.id!==state.textId);state.textId=null;});
  $('upload').onclick=()=>$('image-file').click();$('image-file').onchange=()=>uploadImage($('image-file').files[0]);$('choose-image').onclick=chooseImage;$('generate-image').onclick=generateImage;
  $('remove-image').onclick=()=>mutate(()=>{panel().asset_id=null;});
  $('image-history').onchange=()=>mutate(()=>{panel().asset_id=positiveId($('image-history').value);});
  $('reference-image').onchange=()=>mutate(()=>{panel().reference_asset_id=positiveId($('reference-image').value);});
  $('source-text').oninput=()=>{state.draft=null;$('draft-result').hidden=true;controls();};
  ['panel-count','draft-instructions'].forEach(name=>{$(name).addEventListener('input',()=>{state.draft=null;$('draft-result').hidden=true;controls();});});
  $('chapter-select').onchange=()=>run(async epoch=>{state.draft=null;$('draft-result').hidden=true;const chapterId=$('chapter-select').value;$('source-text').value='';if(!chapterId)return;try{const result=await api(path(`/source/${encodeURIComponent(chapterId)}`));if(epoch===state.epoch)$('source-text').value=result.text;}catch(error){if(epoch===state.epoch)$('chapter-select').value='';throw error;}});
  for(const [name,key,num] of [['page-title','title'],['layout','layout'],['gutter','gutter',true],['continuity','continuity']])bind(name,page,key,num);
  for(const [name,key,num] of [['beat','beat'],['camera','camera'],['image-prompt','image_prompt'],['fit','fit'],['focus-x','focus_x',true],['focus-y','focus_y',true]])bind(name,panel,key,num);
  for(const [name,key,num] of [['lettering-text','text'],['lettering-kind','kind'],['speaker','speaker'],['font-size','font_size',true],['text-x','x',true],['text-y','y',true],['text-w','w',true],['text-h','h',true]])bind(name,lettering,key,num);
  for(const [name,key] of [['comic-title','title'],['style-notes','style_notes'],['adaptation','adaptation'],['characters','characters']])bind(name,()=>state.manifest,key);
  const selectPreview=e=>{if(e.type==='keydown'&&!['Enter',' '].includes(e.key))return;const g=e.target.closest('[data-panel-id]');if(!g)return;e.preventDefault();state.panelId=g.dataset.panelId;state.textId=null;renderInspector();controls();if(window.matchMedia('(max-width:780px)').matches)document.querySelector('.inspector').scrollIntoView({behavior:'smooth',block:'start'});};
  $('preview').addEventListener('click',selectPreview);$('preview').addEventListener('keydown',selectPreview);
  window.addEventListener('beforeunload',e=>{if(state.dirty){stash();e.preventDefault();e.returnValue='';}});
  window.addEventListener('pagehide',stash);
  window.addEventListener('message',e=>{if(e.origin!==window.location.origin||e.source!==window.parent)return;if(e.data?.type==='skriptlab:comics-project-changed'){const next=positiveId(e.data.projectId);if(next!==state.projectId)loadProject(next);}});
  window.addEventListener('storage',e=>{if(e.key==='skriptlab_auth_token'&&!e.newValue){stash();window.location.replace('login.html');}if(e.key==='skriptlab_active_project_id'){const next=positiveId(e.newValue);if(next!==state.projectId)loadProject(next);}});
  if (!window.SkriptLabAuth.requireLogin()) return;
  const params=new URLSearchParams(location.search);setTab('image');loadProject(positiveId(params.has('project')?params.get('project'):localStorage.getItem('skriptlab_active_project_id')));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
