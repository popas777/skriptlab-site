const test = require('node:test');
const assert = require('node:assert/strict');
const discovery = require('../library-discovery.js');

test('ten broad groups and four distinct twenty-book lists replace granular choices', () => {
  assert.equal(discovery.groups.length, 10);
  assert.deepEqual(discovery.lists.map(list => list.label), ['TOP 20 lapset', 'TOP 20 tieto', 'TOP 20 kauno', 'TOP 20 Suomi']);
  for (const list of discovery.lists) {
    assert.equal(list.entries.length, 20);
    assert.equal(new Set(list.entries.map(entry => entry.title + entry.author)).size, 20);
  }
});

test('books can belong to several broad areas, with title and author identity guards', () => {
  const work = {title: 'Frankenstein eli uusi Prometheus', author: 'Mary Shelley', themes: [{label:'Kauhu'}, {label:'Yhteiskunta ja valta'}]};
  assert.deepEqual(new Set(discovery.groupKeys(work)), new Set(['crime-horror', 'society-history', 'scifi']));
  assert.equal(discovery.selectWorks([work], 'group:crime-horror').length, 1);
  assert.equal(discovery.selectWorks([work], 'group:scifi').length, 1);
  assert.equal(discovery.groupKeys({...work, author:'Toinen tekijä', themes:[]}).length, 0);
});

test('Thema prefixes and several old Finnish labels map to one area', () => {
  for (const label of ['Mysteeri ja rikos','Jännitys','Kauhu']) assert.ok(discovery.groupKeys({themes:[{label}]}).includes('crime-horror'));
  assert.ok(discovery.groupKeys({themes:[{code:'YFH',label:'Children’s fantasy'}]}).includes('fairy-fantasy'));
  assert.ok(discovery.groupKeys({themes:[{code:'YFG',label:'Science fiction'}]}).includes('scifi'));
  assert.ok(!discovery.groupKeys({themes:[{code:'FBC',label:'Klassinen kaunokirjallisuus'}]}).includes('knowledge'));
});

test('top membership ignores import IDs and audio version labels but requires exact author and title', () => {
  const works = [
    {id:900,title:'Liisa Ihmemaassa',author:'Lewis Carroll'},
    {id:1,title:'Pikkuprinssi',author:'Antoine de Saint-Exupéry'},
    {id:78,title:'Pikkuprinssi – äänikirja (v004)',author:'Antoine de Saint-Exupéry'},
    {id:3,title:'Pikkuprinssi',author:'Toinen tekijä'},
    {id:28,title:'Liisa Peilimaassa',author:'Lewis Carroll'},
  ];
  assert.deepEqual(discovery.selectWorks(works, 'top:children').map(work => work.id), [1,78,900]);
  assert.deepEqual(discovery.selectWorks(works, 'top:children', false).map(work => work.id), [900,1,78]);
  assert.equal(discovery.missingEntries(works,'top:children').length, 18);
});

test('unavailable information books become available automatically without invented editions', () => {
  const ruhtinas = {id:105,title:'Ruhtinas',author:'Niccolò Machiavelli'};
  const valtio = {id:700,title:'Valtio',author:'Platon'};
  assert.deepEqual(discovery.selectWorks([ruhtinas], 'top:knowledge'), [ruhtinas]);
  assert.equal(discovery.missingEntries([ruhtinas], 'top:knowledge').length, 19);
  assert.deepEqual(discovery.selectWorks([ruhtinas,valtio], 'top:knowledge'), [valtio,ruhtinas]);
  assert.equal(discovery.missingEntries([ruhtinas,valtio], 'top:knowledge').length, 18);
  for (const query of ['TOP20lapset','top 20 tieto','TOP 20 kauno','Top20Suomi']) assert.ok(discovery.searchFilter(query));
});
