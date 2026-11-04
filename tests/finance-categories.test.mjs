import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),C=require('../finance/categories.js');
const base=()=>[{id:'groceries',n:'Groceries',e:'🛒'},{id:'rates',n:'Rates',e:'🏛️'},{id:'other',n:'Miscellaneous / one-offs',e:'•'}];

test('new built-in categories are added once, before Miscellaneous, without touching old ones',()=>{
 const cats=base();C.sync(cats,[],[]);C.sync(cats,[],[]);
 const ids=cats.map(c=>c.id);
 for(const id of ['internet','phone','car','bnpl','travel','work'])assert.equal(ids.filter(x=>x===id).length,1,id);
 assert.deepEqual(ids.slice(0,2),['groceries','rates']);assert.equal(ids.at(-1),'other');
 assert.equal(cats.find(c=>c.id==='bnpl').n,'Pay in 4 / interest free');
});

test('each sinking fund gets its own category, and a removed fund drops out of the list',()=>{
 const cats=base(),funds=[{id:'a1',name:'Christmas',emoji:'🎄'},{id:'b2',name:'Car maintenance',emoji:'🔧'}];
 C.sync(cats,[],funds);
 const f=cats.filter(c=>c.fund);assert.deepEqual(f.map(c=>[c.id,c.n,c.e]),[['fund_a1','Christmas (fund)','🎄'],['fund_b2','Car maintenance (fund)','🔧']]);
 C.sync(cats,[],funds.slice(0,1));assert.deepEqual(cats.filter(c=>c.fund).map(c=>c.id),['fund_a1']);
 assert.equal(cats.at(-1).id,'other');
});

test('your own categories get a safe id, keep their emoji, and the same name twice is not added again',()=>{
 const cats=base(),made=C.makeCustom('  Kids pocket money ','🪙',cats);
 assert.deepEqual(made,{id:'custom_kids_pocket_money',n:'Kids pocket money',e:'🪙'});
 C.sync(cats,[made],[]);assert.equal(cats.at(-2).id,'custom_kids_pocket_money');assert.equal(cats.at(-1).id,'other');
 assert.equal(C.makeCustom('kids POCKET money','⭐',cats).exists.id,'custom_kids_pocket_money');
 assert.equal(C.makeCustom('   ','⭐',cats),null);
 assert.match(C.makeCustom('!!!','⭐',cats).id,/^custom_[a-z0-9]+$/);
});

test('emoji library is grouped and large enough to choose from',()=>{
 const all=C.EMOJI.flatMap(g=>g.e);assert.ok(all.length>=100);assert.equal(new Set(all).size,all.length,'no repeats');
 assert.ok(C.EMOJI.every(g=>g.g&&g.e.length));
});

test('a payment note is saved, trimmed, cleared when empty, and other payments are untouched',()=>{
 const rows=[{id:1,note:'AMAZON MKTPLC',amount:-80},{id:2,note:'Woolies',amount:-20}];
 const a=C.setNote(rows,1,'  school shoes + phone case ');assert.equal(a[0].userNote,'school shoes + phone case');assert.equal(a[1],rows[1]);assert.equal(rows[0].userNote,undefined);
 assert.equal('userNote' in C.setNote(a,1,''),false||'userNote' in C.setNote(a,1,'')[0]);
 assert.equal(C.setNote(a,'1','x'.repeat(300))[0].userNote.length,200);
});

test('wired in: picker offers New category, edit screen has a note box, budget uses the library',()=>{
 const fix=readFileSync(new URL('../finance/fix-numbers.js',import.meta.url),'utf8'),sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 assert.match(fix,/__new">＋ New category…/);assert.match(fix,/fixNoteOpen\(/);assert.match(fix,/FinCats\.setNote/);
 assert.match(sw,/'\.\/finance\/categories\.js'/);
 assert.doesNotMatch(fix,/\.splice\(|delete TXNS/);
});
