const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','comics.js'),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const response=data=>({ok:true,json:async()=>data});
function harness(fetch) {
  const nodes=new Map(),storage=new Map();
  const get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',hidden:false,disabled:false,dataset:{},replaceChildren(){},querySelectorAll(){return[];},setAttribute(){}});return nodes.get(id);};
  const sandbox={document:{readyState:'loading',getElementById:get,addEventListener(){},querySelectorAll(){return[];}},
    window:{SkriptLabAuth:{fetch,getUser:()=>({id:9})}},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    setTimeout:()=>0,clearTimeout(){},Option:function(text,value){this.text=text;this.value=value;},URL:{revokeObjectURL(){}},console};
  vm.runInNewContext(source+`\nrender=()=>{};controls=()=>{};schedulePreview=()=>{};renderStyles=()=>{};loadAssets=async()=>{};globalThis.comic={state,save,loadProject,stash,newPanel,positiveId};`,sandbox);
  const {state}=sandbox.comic;Object.assign(state,{projectId:1,userId:9,revision:0,canEdit:true,dirty:true,manifest:{schema_version:1,title:'A',pages:[]}});
  return {...sandbox.comic,storage,get};
}
test('comic saves serialize edits and use the new revision',async()=>{
  const first=deferred(),calls=[];
  const h=harness(async(url,options)=>{calls.push(JSON.parse(options.body));return calls.length===1?first.promise:response({revision:2});});
  const saving=h.save();h.state.manifest.title='B';h.state.edit++;const next=h.save();
  assert.equal(calls.length,1);first.resolve(response({revision:1}));await Promise.all([saving,next]);
  assert.equal(calls.length,2);assert.equal(calls[1].base_revision,1);assert.equal(calls[1].manifest.title,'B');assert.equal(h.state.dirty,false);
});
test('conflicting save preserves local document and stops overwrites',async()=>{
  let count=0;const h=harness(async()=>{count++;return {ok:false,status:409,json:async()=>({detail:'Changed elsewhere'})};});
  await assert.rejects(h.save(),/Changed elsewhere/);assert.equal(h.state.manifest.title,'A');assert.equal(h.state.conflict,true);
  await assert.rejects(h.save(),/ristiriita/);assert.equal(count,1);assert.match(h.storage.get('skriptlab_comics_draft:9:1'),/"dirty":true/);
});
test('network error keeps edits for an explicit retry',async()=>{
  let calls=0;const h=harness(async()=>{calls++;if(calls===1)throw new Error('offline');return response({revision:1});});
  await assert.rejects(h.save(),/offline/);assert.equal(h.state.dirty,true);assert.equal(calls,1);
  await h.save();assert.equal(h.state.dirty,false);assert.equal(calls,2);
});
test('save finishing after a project switch updates only its own cached copy',async()=>{
  const pending=deferred();const h=harness(()=>pending.promise);h.stash();const saved=h.save();
  h.state.epoch++;h.state.projectId=2;h.state.manifest={title:'Other',pages:[]};h.state.revision=5;
  pending.resolve(response({revision:1}));await saved;
  assert.equal(h.state.manifest.title,'Other');assert.equal(h.state.revision,5);
  const cached=JSON.parse(h.storage.get('skriptlab_comics_draft:9:1'));assert.equal(cached.revision,1);assert.equal(cached.dirty,false);
});
test('out-of-order project loads never replace the active project',async()=>{
  const a=deferred(),b=deferred();const h=harness(url=>url.includes('/1/')?a.promise:b.promise);
  const first=h.loadProject(1),second=h.loadProject(2);
  const data=title=>({manifest:{title,pages:[]},revision:0,can_edit:true,styles:[],chapters:[],image_models:[]});
  b.resolve(response(data('Second')));await second;a.resolve(response(data('First')));await first;
  assert.equal(h.state.projectId,2);assert.equal(h.state.manifest.title,'Second');
});
test('module is wired into shell navigation and project refresh',()=>{
  const root=path.join(__dirname,'..');const html=fs.readFileSync(path.join(root,'index.html'),'utf8');const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
  assert.match(html,/data-view="view-sarjakuvat">Sarjakuvat/);assert.match(html,/id="comics-frame"/);
  assert.match(app,/comics: \['view-sarjakuvat'\]/);assert.match(app,/skriptlab:comics-project-changed/);
  assert.equal((app.match(/if \(currentViewId === 'view-sarjakuvat'\) refreshComicsFrame/g)||[]).length,2);
});
