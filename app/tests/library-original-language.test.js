const test = require('node:test');
const assert = require('node:assert/strict');
const languages = require('../library-original-language.js');

test('a Finnish edition retains its original language across text and audio imports', () => {
  for (const title of ['Pikkuprinssi', 'Pikkuprinssi – äänikirja (v004)']) {
    assert.deepEqual(languages.forWork({id:987, title, author:'Antoine de Saint-Exupéry', language:'fi'}), ['fr']);
  }
  assert.deepEqual(languages.forWork({title:'Pikkuprinssi', author:'Toinen tekijä', language:'fi'}), []);
  assert.deepEqual(languages.forWork({title:'Tuntematon teos', author:'Jane Austen', language:'fi', source_language:'en'}), []);
});

test('the work language does not follow nationality or a historical Finnish translation', () => {
  for (const [title, author, language] of [
    ['Profeetta','Kahlil Gibran','en'], ['Pimeyden sydän','Joseph Conrad','en'],
    ['Vänrikki Stoolin tarinat','J. L. Runeberg','sv'], ['Muodonmuutos','Franz Kafka','de'],
    ['Utopia','Thomas More','la'], ['Nukkekoti','Henrik Ibsen','no'],
    ['Valtio','Platon','grc'], ['Rautatie','Juhani Aho','fi'],
  ]) assert.deepEqual(languages.forWork({title, author, language:'fi'}), [language]);
});

test('explicit original-language metadata takes precedence and normalizes codes', () => {
  const work = {title:'Pikkuprinssi', author:'Antoine de Saint-Exupéry', raw:{original_language:'ENG-us'}};
  assert.deepEqual(languages.forWork(work), ['en']);
  assert.deepEqual(languages.forWork({original_languages:['fre','FR-fr','NOB','sv']}), ['fr','no','sv']);
  for (const code of ['und','mul','zxx','not a language',null]) assert.equal(languages.normalize(code), '');
  assert.deepEqual(languages.forWork({...work,raw:{original_language:'und'}}), []);
});

test('filtering preserves sort order, supports several original languages and separates unknowns', () => {
  const works = [{id:1,original_language:'fr'}, {id:2,language:'fr'},
    {id:3,original_languages:['en','fr']}, {id:4,original_language:'en'}];
  assert.deepEqual(languages.selectWorks(works,'fr').map(v=>v.id), [1,3]);
  assert.deepEqual(languages.selectWorks(works,'en').map(v=>v.id), [3,4]);
  assert.deepEqual(languages.selectWorks(works,'unknown').map(v=>v.id), [2]);
  assert.deepEqual(languages.selectWorks(works,''), works);
  assert.equal(works.length,4);
});

test('the maintained catalogue has distinct identities and labelled languages', () => {
  const identities = new Set();
  for (const work of languages.records) {
    const key = `${work.title}|${work.author}`;
    assert(!identities.has(key),key); identities.add(key);
    assert.deepEqual(languages.forWork(work), [work.language]);
    assert.notEqual(languages.label(work.language),work.language);
  }
  const options=languages.options([{original_language:'ja'}]);
  assert.equal(options.filter(v=>v.value==='en').length,1);
  assert.ok(options.some(v=>v.value==='ja'));
  assert.equal(languages.label(''), 'Ei tiedossa');
});
