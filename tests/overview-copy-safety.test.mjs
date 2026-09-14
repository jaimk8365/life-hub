import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/finance.html',import.meta.url),'utf8');
test('Overview guidance does not reveal private debt providers or depend on Claude',()=>{
 const habits=source.slice(source.indexOf('const MONEY_HABITS='),source.indexOf('function dailyState('));
 assert.equal(/Zip|Pay-in-4|Latitude|\$100/.test(habits),false);
 assert.equal(source.includes("Screenshot yesterday's transactions & send to Claude"),false);
});
test('Custom priority labels are escaped before rendering',()=>{
 const card=source.slice(source.indexOf('function topPrioritiesCard('),source.indexOf('function topPrioritiesCard(')+2000);
 assert.equal(card.includes('${esc(i.label)}'),true);
});
