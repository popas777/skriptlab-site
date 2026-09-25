const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const state = {document:{getElementById:()=>null}, window:{}, module:{exports:{}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','audio-plays.js'),'utf8'),state);
const {names, scenes}=state.module.exports;
const plain = value => JSON.parse(JSON.stringify(value));
test('casting ignores stage directions and headings while accepting Finnish speaker names',()=>{
 assert.deepEqual(plain(names('# Näytös: alku\n[Anna: avaa oven.]\nANNA [hiljaa]: Hei.\nVÄINÖ: Päivää.\nanna: Tule sisään.')), ['anna','VÄINÖ']);
});
test('dialogue samples retain scene boundaries, directions and pauses in their source order',()=>{
 const result=plain(scenes('# Piha\nANNA: Hei.\n[TAUKO 800]\n# Huone\nVÄINÖ [hiljaa]: Tule.'));
 assert.equal(result.length,2);
 assert.equal(result[0].script,'# Piha\nANNA: Hei.\n[TAUKO 800]');
 assert.equal(result[1].script,'# Huone\nVÄINÖ [hiljaa]: Tule.');
});
test('a repeated scene name remains a separate selectable scene',()=>{
 assert.equal(scenes('# Piha\nANNA: Hei.\n# Piha\nANNA: Taas täällä.').length,2);
});
