import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const M=createRequire(import.meta.url)('../finance/meaning.js');
test('one money format everywhere',()=>{assert.equal(M.aud(1234.5),'$1,235');assert.equal(M.aud(-50),'-$50');assert.equal(M.aud(0),'$0');});
test('safe to spend: not ready, healthy, low and negative each say something plain',()=>{
 assert.equal(M.safeMeaning({trusted:false}).tone,'watch');
 const ok=M.safeMeaning({trusted:true,safe:340,daysLeft:2});assert.equal(ok.tone,'good');assert.match(ok.text,/About \$113 a day/);
 assert.equal(M.safeMeaning({trusted:true,safe:40,daysLeft:2}).tone,'watch');
 const bad=M.safeMeaning({trusted:true,safe:-20,daysLeft:2});assert.equal(bad.tone,'act');assert.match(bad.text,/Hold off/);
});
const accts=[{id:'everyday',name:'Everyday',type:'spend',balance:1982,buffer:200,lastDate:'2026-10-17'},{id:'bills',name:'Bills',type:'spend',balance:90,buffer:200,lastDate:'2026-10-10'},{id:'house',name:'House Loan',type:'loan',balance:-420000,lastDate:null}];
test('accounts: headline totals, freshness and buffer words per account',()=>{
 const s=M.accountsSummary({today:'2026-10-18',accounts:accts});
 assert.match(s.lines[0],/You have \$2,072 across your spending and savings accounts and owe \$420,000 on loans/);
 assert.equal(s.tone,'act');assert.match(s.lines.join(' '),/1 account is below its safety buffer/);assert.match(s.lines.join(' '),/1 account has old data/);
 assert.equal(s.rows.everyday.tone,'good');assert.match(s.rows.everyday.text,/Up to date · Above its \$200 buffer/);
 assert.equal(s.rows.bills.tone,'act');assert.match(s.rows.bills.text,/Not updated for 8 days · Below its \$200 safety buffer/);
 assert.match(s.rows.house.text,/You owe \$420,000/);
 const unk=M.accountsSummary({today:'2026-10-18',accounts:[{id:'a',name:'A',type:'spend',balance:5,buffer:0,lastDate:null}]});assert.equal(unk.tone,'watch');assert.match(unk.lines[1],/no recent activity, so I cannot tell/);assert.ok(!unk.lines.join(' ').includes('Every account is up to date'));
 const fine=M.accountsSummary({today:'2026-10-18',accounts:[accts[0]]});assert.equal(fine.tone,'good');assert.match(fine.lines[1],/up to date and above its buffer/);
});
test('budget: planned, spent, left, who is over, and how to read the bars',()=>{
 const s=M.budgetSummary({categories:[{name:'Groceries',actual:300,budget:500,status:'on_track'},{name:'Eating out',actual:210,budget:150,status:'over'},{name:'Fuel',actual:120,budget:130,status:'tracking_high'},{name:'Misc',actual:20,budget:0,status:'unbudgeted'}]});
 assert.equal(s.planned,780);assert.equal(s.spent,630);assert.equal(s.left,150);assert.equal(s.tone,'act');
 assert.match(s.lines[0],/planned \$780 and have spent \$630. That leaves \$150/);assert.match(s.lines[1],/Eating out by \$60/);assert.match(s.lines[2],/Fuel is on pace to go over/);assert.match(s.lines.at(-1),/green is on track, amber/);
 assert.equal(M.budgetSummary({categories:[{name:'A',actual:1,budget:10,status:'on_track'}]}).tone,'good');
});
test('bills: next 7 days total, next bill, and whether the paying account covers it',()=>{
 const bills=[{name:'Energex',amount:312.45,due:'2026-10-23',acct:'bills'},{name:'Netflix',amount:20,due:'2026-10-19',acct:'everyday'},{name:'Rates',amount:900,due:'2026-12-01',acct:'bills'}];
 const s=M.billsSummary({today:'2026-10-18',bills,balances:{bills:100,everyday:500},names:{bills:'Bills',everyday:'Everyday'}});
 assert.match(s.lines[0],/2 bills are due in the next 7 days, \$332 in total/);assert.match(s.lines[1],/Next up: Netflix, \$20, tomorrow/);
 assert.match(s.lines.join(' '),/Bills has \$100 but \$312 is due from it. It is short by \$212/);assert.match(s.lines.join(' '),/Everyday has \$500, enough for the \$20 due/);
 assert.equal(s.tone,'act');assert.equal(s.rows['Netflix|2026-10-19'].tone,'act');assert.equal(s.rows['Energex|2026-10-23'].tone,'watch');assert.equal(s.rows['Rates|2026-12-01'].tone,'good');
 assert.equal(M.billsSummary({today:'2026-10-18',bills:[]}).lines[0],'No upcoming bills are listed.');
 assert.match(M.billsSummary({today:'2026-10-18',bills:[bills[2]],balances:{}}).lines[0],/Nothing is due in the next 7 days/);
});
test('drawing is escaped and carries the tone',()=>{
 const h=M.meaningHtml({tone:'act',lines:['<b>x</b> is over']},'t');assert.ok(h.includes('fh-t-act')&&h.includes('&lt;b&gt;')&&!h.includes('<b>x'));
 assert.equal(M.meaningHtml({tone:'good',lines:[]}),'');assert.ok(M.pillHtml({tone:'good',text:'Up to date'}).includes('Up to date'));
});
