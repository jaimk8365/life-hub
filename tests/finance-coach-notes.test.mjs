import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),C=require('../finance/coach.js');

test('a note keeps your words and known tags, and an empty note is removed',()=>{
 const st=C.emptyState();
 const n=C.addNote(st,{key:'week:2026-10-28:other',cat:'other',name:'Misc',period:'Week of 28 Oct',text:'  new fridge  ',tags:['oneoff','oneoff','made-up'],at:'2026-11-04'});
 assert.equal(n.text,'new fridge');assert.deepEqual(n.tags,['oneoff']);assert.equal(st.notes['week:2026-10-28:other'].cat,'other');
 assert.equal(C.addNote(st,{key:'week:2026-10-28:other',text:'',tags:[]}),null);assert.deepEqual(st.notes,{});
 assert.throws(()=>C.addNote(st,{text:'x'}));
 assert.equal(C.addNote(st,{key:'k',text:'x'.repeat(900)}).text.length,500);
});

test('past notes for the same area come back newest first, without the current one',()=>{
 const st=C.emptyState();
 C.addNote(st,{key:'a',cat:'other',text:'older',at:'2026-10-21'});C.addNote(st,{key:'b',cat:'other',text:'newer',at:'2026-10-28'});C.addNote(st,{key:'c',cat:'fuel',text:'fuel',at:'2026-10-29'});C.addNote(st,{key:'d',cat:'other',text:'now',at:'2026-11-04'});
 assert.deepEqual(C.notesFor(st,'other','d').map(n=>n.text),['newer','older']);
});

test('tags decide how the payments are treated in future checks',()=>{
 assert.equal(C.noteMark(['oneoff']),'exceptional');assert.equal(C.noteMark(['emergency']),'exceptional');assert.equal(C.noteMark(['planned']),'planned');
 assert.equal(C.noteMark(['wrong']),null);assert.equal(C.noteMark([]),null);
 assert.deepEqual(Object.keys(C.NOTE_TAGS),['oneoff','emergency','planned','wrong']);
});

test('detail rows carry your own payment notes',()=>{
 const d=C.overDetail({txns:[{id:1,cat:'x',date:'2026-10-29',amount:-10,note:'Shop',userNote:'school camp'}],cat:'x',from:'2026-10-28',to:'2026-11-03',limit:5});
 assert.equal(d.rows[0].userNote,'school camp');
});

test('review drawers have a What happened box, per-payment notes and Move to',()=>{
 const ui=readFileSync(new URL('../finance/coach-ui.js',import.meta.url),'utf8');
 assert.match(ui,/coachNoteBox\(\{key:\(month\?'month:':'week:'\)\+from\+':'\+o\.cat/);
 assert.match(ui,/coachNoteBox\(\{key:'leak:'/);
 assert.match(ui,/onchange="coachMoveTx\(/);assert.match(ui,/function coachTxNoteSave/);
 assert.match(ui,/confirm\('Leave '/,'tags only mark payments after asking');
});
