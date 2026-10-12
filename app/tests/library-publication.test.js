const test = require('node:test');
const assert = require('node:assert/strict');
const publication = require('../library-publication.js');

test('original years match both title and author and stay the same across audio editions and imports', () => {
  for (const title of ['Pikkuprinssi', 'Pikkuprinssi – äänikirja (v004)']) {
    assert.equal(publication.forWork({id:987,title,author:'Antoine de Saint-Exupéry',published_at:'2026-10-12'}).year,1943);
  }
  assert.equal(publication.forWork({title:'Pikkuprinssi',author:'Toinen tekijä'}),null);
  assert.equal(publication.forWork({name:'Pikkuprinssi',creator:'Antoine de Saint-Exupéry'}).year,1943);
  assert.equal(publication.forWork({title:'Tunnistamaton',author:'Tekijä',published_at:'1900-01-01',publication_date:'1910-01-01'}),null);
});

test('centuries remain estimates and BCE dates sort before CE dates without a fabricated displayed year', () => {
  const plato=publication.forWork({title:'Valtio',author:'Platon'});
  const dante=publication.forWork({title:'Jumalainen näytelmä',author:'Dante Alighieri'});
  assert.equal(plato.label,'4. vuosisata eaa. (arvio)');
  assert.equal(plato.year,null);
  assert.equal(dante.label,'14. vuosisata (arvio)');
  assert.equal(dante.year,null);
  const works=[{id:1,original_publication_year:1},{id:2,original_publication_year:-1},
    {id:3,title:'Valtio',author:'Platon'},{id:4,title:'Jumalainen näytelmä',author:'Dante Alighieri'}];
  assert.deepEqual(publication.sortWorks(works,'original-oldest').map(w=>w.id),[3,2,1,4]);
  assert.deepEqual(publication.sortWorks(works,'original-newest').map(w=>w.id),[4,1,2,3]);
});

test('dated and unknown works sort consistently in both directions without mutating their input', () => {
  const works=[{id:1,title:'Öinen teos',original_publication_year:1900},
    {id:2,title:'Aamun teos',original_publication_year:1900},
    {id:3,title:'Tuntematon'}, {id:4,title:'Vanha',original_publication_century:17},
    {id:5,title:'Uusi',original_publication_year:2020}];
  const before=JSON.stringify(works);
  assert.deepEqual(publication.sortWorks(works,'original-oldest').map(w=>w.id),[4,2,1,5,3]);
  assert.deepEqual(publication.sortWorks(works,'original-newest').map(w=>w.id),[5,2,1,4,3]);
  assert.equal(JSON.stringify(works),before);
  assert.deepEqual(publication.sortWorks(works,'title'),works);
});

test('explicit original metadata overrides curated data and invalid years fall back to a supplied century', () => {
  const work={title:'Pikkuprinssi',author:'Antoine de Saint-Exupéry',raw:{original_publication_year:1944}};
  assert.equal(publication.forWork(work).year,1944);
  for(const year of [0,null,'unknown',Infinity,10000]) {
    const date=publication.forWork({original_publication_year:year,original_publication_century:18});
    assert.equal(date.year,null);assert.equal(date.label,'18. vuosisata (arvio)');
  }
  assert.equal(publication.forWork({original_publication_year:0,original_publication_century:0}),null);
});

test('multi-part works retain a date range and use the first part in chronological order', () => {
  const faust=publication.forWork({title:'Faust',author:'Johann Wolfgang von Goethe'});
  assert.equal(faust.label,'1808–1832');assert.equal(faust.sortYear,1808);
  const putkinotko=publication.forWork({title:'Putkinotko',author:'Joel Lehtonen'});
  assert.equal(putkinotko.label,'1919–1920');assert.equal(putkinotko.sortYear,1919);
  const verses=publication.forWork({title:'Vänrikki Stoolin tarinat',author:'J. L. Runeberg',published_at:'1922-01-01'});
  assert.equal(verses.label,'1848–1860');
});

test('the reference catalogue has unique work identities and valid, sourced dates or explicit century estimates', () => {
  const identities=new Set();
  for(const record of publication.records) {
    const key=`${record.title}|${record.author}`;
    assert(!identities.has(key),key);identities.add(key);
    const date=publication.forWork(record);
    assert(date && Number.isFinite(date.sortYear),key);
    assert(date.century || date.sources.length,key);
    for(const source of date.sources)assert.equal(new URL(source).protocol,'https:');
  }
});
