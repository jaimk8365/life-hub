import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {patchFinanceEvidence} from '../tools/finance-evidence-patches.mjs';

// Run selected production functions only, with synthetic AUD records. Never run
// page initialization, private seeds, storage, network or encryption keys.
const source=readFileSync(new URL('../src/finance.html',import.meta.url),'utf8');
function functionSource(name){
  const lines=source.split('\n'),first=lines.findIndex(line=>line.startsWith(`function ${name}(`));
  if(first<0)throw new Error(`Missing production function: ${name}`);
  if(lines[first].endsWith('}'))return lines[first];
  const last=lines.findIndex((line,i)=>i>first&&line==='}');
  if(last<first)throw new Error(`Unterminated production function: ${name}`);
  return lines.slice(first,last+1).join('\n');
}
function runtime(overrides={}){
  const sheet={innerHTML:''};
  const ctx=vm.createContext({
    Date:class extends Date{constructor(...args){super(...(args.length?args:['2026-10-09T12:00:00+10:00']));}},
    todayISO:()=> '2026-10-09',thisYM:'2026-10',
    ACCTS:[{id:'everyday',name:'Everyday',type:'spend',openBal:1000,budgetMo:0,
      sourceBalance:{amount:1000,date:'2026-10-09',source:'synthetic bank'}}],
    TXNS:[],BILLS:[],TRANSFERS:[],ONEOFFS:[],WISH:[],FUNDS:[],GOALS:[],BILL_ALLOC:[],BASE_PAY:[],
    BUFFERS:{everyday:100},WEEK_PLAN:{selectedCats:[],oneOffs:[]},CAT_BUDGET:{},
    REQUIRED_OFFSET_ACCOUNTS:['everyday','bills','loanrepay','jspend','savings'],
    load:()=>[],save:()=>{throw new Error('Evidence calculation must not write');},
    financeEvidence:()=>({trusted:true}),
    ymd:(y,m,d)=>`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`,
    billOccurrencesBetween:()=>[],catOf:id=>({n:id}),normMerchant:s=>String(s).toLowerCase().trim(),
    esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    AUD0:n=>`AUD ${Number(n).toFixed(0)}`,AUD:n=>`AUD ${Number(n).toFixed(2)}`,
    infoButton:()=>'',fmtDate:s=>s,openSheet:()=>{},$:()=>sheet,
    wishlistAllocatedForAccount:id=>ctx.WISH.filter(w=>(w.acct||'jspend')===id).reduce((s,w)=>s+(+w.saved||0),0),
    acctById:id=>ctx.ACCTS.find(a=>a.id===id),
    balance:id=>{const a=ctx.ACCTS.find(a=>a.id===id);return a?(+a.openBal||0)+ctx.TXNS.filter(t=>t.acct===id&&!t.deleted&&t.date<='2026-10-09').reduce((s,t)=>s+(+t.amount||0),0):0;},
    ...overrides,
  });
  const functions=['financeDatePlusDays','daysInMonth','billOccurrenceAt','billOccurrencesBetween','goalSaved','reservedForAccount','plannedTransferAmount','everydayCommitments',
    'safeSpend','safeSpendCard','buildWeeklyEverydayPlan','ledgerDifference','forecastAccountEvidence',
    'payMatchRows','futureBaseIncome','forecastAccount','accountForecastCard','openForecast',
    'selectedOffsetAccountIds','simulateOffsetLoan','offsetImpact','openLoanSettings'];
  for(const name of functions)if(source.includes(`function ${name}(`))vm.runInContext(functionSource(name),ctx);
  return {ctx,sheet,run:expression=>vm.runInContext(expression,ctx)};
}

test('Safe to Spend protects Everyday goals and funds and counts wishlist once',()=>{
  const r=runtime({WISH:[{acct:'everyday',saved:100}],FUNDS:[{acct:'everyday',saved:200}],
    GOALS:[{acct:'everyday',alloc:[{amt:500}]}]});
  assert.equal(r.run("reservedForAccount('everyday')"),800);
  assert.equal(r.run('safeSpend().safe'),100);
  assert.equal(r.run('safeSpend().reserved'),800);
  assert.equal(r.run('safeSpend().wishlist'),100);
  assert.equal(r.run('buildWeeklyEverydayPlan().remaining'),100);
  assert.match(r.run('safeSpendCard()'),/AUD 800 reserved for goals, funds and wishlist items/);
});

test('Archived and other-account goals do not reduce Everyday Safe to Spend',()=>{
  const r=runtime({GOALS:[{acct:'everyday',status:'archived',alloc:[{amt:800}]},
    {acct:'bills',alloc:[{amt:800}]}],FUNDS:[{acct:'savings',saved:800}]});
  assert.equal(r.run('safeSpend().safe'),900);
});

test('Forecast spending excludes unresolved, missing-source and deleted transactions',()=>{
  const rows=[{id:'reviewed',acct:'everyday',date:'2026-10-08',amount:-280,cat:'groceries'},
    ...['needsReview','needsDetails','sourceMissing','deleted'].map(flag=>({id:flag,acct:'everyday',
      date:'2026-10-08',amount:-280,cat:'groceries',[flag]:true}))];
  const r=runtime({TXNS:rows});
  assert.equal(r.run("forecastAccount('everyday').avgOut"),140);
});

test('Unresolved salary records never seed expected future wages',()=>{
  for(const flag of ['needsReview','needsDetails','sourceMissing','deleted']){
    const r=runtime({BASE_PAY:[{base:1000,cadence:'weekly',match:'synthetic employer'}],
      TXNS:[{id:'pay',acct:'everyday',date:'2026-10-08',amount:1000,cat:'income',note:'Synthetic employer salary',[flag]:true}]});
    assert.equal(r.run("futureBaseIncome('everyday','2026-10-09','2026-10-22')"),0,flag);
  }
});

test('Forecast requires a dated reconciled balance for its own account',()=>{
  const r=runtime();
  assert.equal(r.run("forecastAccountEvidence('everyday').trusted"),true);
  r.ctx.ACCTS[0].sourceBalance.amount=1001;
  assert.equal(r.run("forecastAccountEvidence('everyday').trusted"),false);
  r.ctx.ACCTS[0].sourceBalance.amount=1000;
  for(const amount of [null,'',NaN,Infinity]){
    r.ctx.ACCTS[0].sourceBalance.amount=amount;
    assert.equal(r.run("forecastAccountEvidence('everyday').trusted"),false,String(amount));
  }
  r.ctx.ACCTS[0].sourceBalance.amount=1000;
  for(const date of ['2026-09-01','2026-10-10','not a date','2026-02-31']){
    r.ctx.ACCTS[0].sourceBalance.date=date;
    assert.equal(r.run("forecastAccountEvidence('everyday').trusted"),false,date);
  }
  delete r.ctx.ACCTS[0].sourceBalance;
  assert.equal(r.run("forecastAccountEvidence('everyday').trusted"),false);
});

test('Forecast blocks unresolved rows and conflicts but ignores deleted review flags',()=>{
  const r=runtime({TXNS:[{id:'review',acct:'everyday',date:'2026-10-08',amount:0,needsReview:true}]});
  assert.equal(r.run("forecastAccountEvidence('everyday').trusted"),false);
  r.ctx.TXNS[0].deleted=true;
  assert.equal(r.run("forecastAccountEvidence('everyday').trusted"),true);
  r.ctx.load=()=>[{id:'unresolved'}];
  assert.equal(r.run("forecastAccountEvidence('everyday').trusted"),false);
});

test('Forecast requires a finite opening balance and a named balance source',()=>{
  const r=runtime();
  for(const openBal of [undefined,null,'',NaN,Infinity]){
    r.ctx.ACCTS[0].openBal=openBal;
    assert.equal(r.run("forecastAccountEvidence('everyday').trusted"),false,String(openBal));
  }
  r.ctx.ACCTS[0].openBal=1000;
  for(const source of [undefined,null,'','   ',42]){
    r.ctx.ACCTS[0].sourceBalance.source=source;
    assert.equal(r.run("forecastAccountEvidence('everyday').trusted"),false,String(source));
  }
  r.ctx.ACCTS[0].sourceBalance.source='synthetic bank';
  assert.equal(r.run("forecastAccountEvidence('everyday').trusted"),true);
});

test('Forecast rejects malformed nondeleted ledger amounts and impossible calendar dates',()=>{
  const r=runtime({TXNS:[{id:'row',acct:'everyday',date:'2026-10-08',amount:0,cat:'groceries'}]});
  for(const amount of [undefined,null,'','  ','broken',NaN,Infinity,[],false]){
    r.ctx.TXNS[0].amount=amount;
    assert.equal(r.run("forecastAccountEvidence('everyday').trusted"),false,String(amount));
    assert.match(r.run("forecastAccountEvidence('everyday').reason"),/invalid amount or date/);
  }
  r.ctx.TXNS[0].amount='0';
  assert.equal(r.run("forecastAccountEvidence('everyday').trusted"),true);
  for(const date of [undefined,'','broken','2026-02-31','2026-10-08 extra']){
    r.ctx.TXNS[0].date=date;
    assert.equal(r.run("forecastAccountEvidence('everyday').trusted"),false,String(date));
  }
  r.ctx.TXNS[0].deleted=true;
  assert.equal(r.run("forecastAccountEvidence('everyday').trusted"),true);
});

test('Another account needing review does not make this account balance stale',()=>{
  const r=runtime({TXNS:[{id:'review',acct:'bills',date:'2026-10-08',amount:0,needsReview:true}]});
  assert.equal(r.run("forecastAccountEvidence('everyday').trusted"),true);
});

test('Main spending recommendations share the strict essential-account evidence guard',()=>{
  const r=runtime();
  r.ctx.ACCTS.push(...['bills','loanrepay'].map(id=>({id,name:id,openBal:0,
    sourceBalance:{amount:0,date:'2026-10-09',source:'synthetic bank'}})));
  vm.runInContext(functionSource('financeEvidence'),r.ctx);
  assert.equal(r.run('financeEvidence().trusted'),true);
  r.ctx.ACCTS[1].sourceBalance.amount=null;
  assert.equal(r.run('financeEvidence().trusted'),false,'missing source amount is not a confirmed zero');
  r.ctx.ACCTS[1].sourceBalance.amount=0;
  r.ctx.TXNS.push({id:'invalid',acct:'bills',date:'2026-10-08',amount:'garbled'});
  assert.equal(r.run('financeEvidence().trusted'),false,'malformed ledger cannot permit spending advice');
});

test('Forecast with unverified balance renders a pause instead of an actionable amount',()=>{
  const r=runtime({ACCTS:[{id:'everyday',name:'Everyday',type:'spend',openBal:1000}],
    TXNS:[{acct:'everyday',date:'2026-10-08',amount:-280,cat:'groceries'}]});
  assert.equal(r.run("forecastAccount('everyday').trusted"),false);
  const card=r.run('accountForecastCard(ACCTS[0])');
  assert.match(card,/Forecast paused/);
  assert.doesNotMatch(card,/AUD/);
  r.run("openForecast('everyday')");
  assert.match(r.sheet.innerHTML,/Forecast paused/);
  assert.doesNotMatch(r.sheet.innerHTML,/AUD/);
});

test('Verified forecast protects every current account reservation once',()=>{
  const r=runtime({WISH:[{acct:'everyday',saved:100}],FUNDS:[{acct:'everyday',saved:200}],
    GOALS:[{acct:'everyday',alloc:[{amt:300}]}],
    TXNS:[{acct:'everyday',date:'2026-10-08',amount:-280,cat:'groceries'}]});
  r.ctx.ACCTS[0].sourceBalance.amount=720;
  assert.equal(r.run("forecastAccount('everyday').trusted"),true);
  assert.equal(r.run("forecastAccount('everyday').reserved"),600);
  assert.equal(r.run("forecastAccount('everyday').predicted"),-120);
});

function billsRuntime(allocations,additional={}){
  return runtime({ACCTS:[{id:'bills',name:'Bills',type:'spend',openBal:1000,
    sourceBalance:{amount:1000,date:'2026-10-09',source:'synthetic bank'}}],BUFFERS:{},
    BILLS:[{id:'bill',acct:'bills',amount:400,anchor:'2026-10-10',frequency:'once'}],
    BILL_ALLOC:allocations,...additional});
}

test('Fully funded and partially funded matching bill allocations are charged once in the forecast',()=>{
  for(const allocated of [400,150]){
    const r=billsRuntime([{billId:'bill',due:'2026-10-10',allocated}]);
    assert.equal(r.run("forecastAccount('bills').scheduledTotal"),400);
    assert.equal(r.run("forecastAccount('bills').reservedTotal"),allocated);
    assert.equal(r.run("forecastAccount('bills').scheduledReservations"),allocated);
    assert.equal(r.run("forecastAccount('bills').reserved"),0);
    assert.equal(r.run("forecastAccount('bills').predicted"),600);
  }
});

test('Unmatched, future-date and custom bill allocations remain protected',()=>{
  const r=billsRuntime([{billId:'bill',due:'2026-10-10',allocated:100},
    {billId:'different',due:'2026-10-10',allocated:50},
    {billId:'bill',due:'2026-11-10',allocated:60},
    {name:'Custom reserve',due:'2026-10-10',allocated:70}]);
  assert.equal(r.run("forecastAccount('bills').scheduledReservations"),100);
  assert.equal(r.run("forecastAccount('bills').reserved"),180);
  assert.equal(r.run("forecastAccount('bills').predicted"),420);
});

test('Matching bill allocation overlap is capped at the scheduled bill total and other goals stay reserved',()=>{
  const r=billsRuntime([{billId:'bill',due:'2026-10-10',allocated:350},
    {billId:'bill',due:'2026-10-10',allocated:350}],{GOALS:[{acct:'bills',alloc:[{amt:100}]}]});
  const before=r.run('JSON.stringify({BILLS,BILL_ALLOC,GOALS})');
  assert.equal(r.run("forecastAccount('bills').reservedTotal"),800);
  assert.equal(r.run("forecastAccount('bills').scheduledReservations"),400);
  assert.equal(r.run("forecastAccount('bills').reserved"),400);
  assert.equal(r.run("forecastAccount('bills').predicted"),200);
  assert.equal(r.run('JSON.stringify({BILLS,BILL_ALLOC,GOALS})'),before);
});

test('Forecast breakdown explains bill allocations included in scheduled payments once',()=>{
  const r=billsRuntime([{billId:'bill',due:'2026-10-10',allocated:400}],
    {TXNS:[{acct:'bills',date:'2026-10-08',amount:-28,cat:'groceries'}]});
  r.ctx.ACCTS[0].sourceBalance.amount=972;
  assert.match(r.run('accountForecastCard(ACCTS[0])'),/AUD 400 of bill allocations are already included in scheduled payments/);
  r.run("openForecast('bills')");
  assert.match(r.sheet.innerHTML,/AUD 400 of bill allocations are already included in scheduled payments/);
});

test('Missing or explicitly empty offset selection assumes no eligible accounts',()=>{
  const r=runtime();
  for(const selection of [{id:'house',rate:6,minRepay:100},{id:'house',rate:6,minRepay:100,offsetAccountIds:[]}]){
    r.ctx.loan=selection;
    assert.equal(r.run('offsetImpact(loan).ids.length'),0);
    assert.equal(r.run('offsetImpact(loan).interestSaved'),null);
  }
});

test('Saved eligible offset links are retained without mutating the loan or adding defaults',()=>{
  const r=runtime({ACCTS:[{id:'everyday',type:'spend',openBal:500},
    {id:'custom-offset',type:'save',openBal:200},{id:'house',type:'loan',openBal:-10000}]});
  const loan={id:'house',rate:6,minRepay:100,offsetAccountIds:['custom-offset','everyday']};
  r.ctx.loan=loan;const before=JSON.stringify(loan);
  assert.deepEqual(JSON.parse(r.run('JSON.stringify(offsetImpact(loan).ids)')),['custom-offset','everyday']);
  assert.equal(r.run('offsetImpact(loan).offsetTotal'),700);
  assert.equal(JSON.stringify(loan),before);
});

test('Offset settings do not silently check accounts when no links were confirmed',()=>{
  const r=runtime({ACCTS:[{id:'house',name:'House loan',type:'loan',openBal:-10000},
    {id:'everyday',name:'Everyday',type:'spend',openBal:500}]});
  r.run("openLoanSettings('house')");
  assert.doesNotMatch(r.sheet.innerHTML,/class="ls_offset"[^>]*checked/);
  assert.match(r.sheet.innerHTML,/bank confirms are eligible/);
});

test('Evidence patch is idempotent and refuses partial or unrecognised source',()=>{
  assert.equal(patchFinanceEvidence(source),source);
  assert.throws(()=>patchFinanceEvidence(source.replace('Select only accounts your bank confirms are eligible','Changed offset explanation')),/incomplete/);
  assert.throws(()=>patchFinanceEvidence('function forecastAccount(id){}'),/source changed/);
});

test('Calculation repairs leave synthetic account and reservation records unchanged',()=>{
  const r=runtime({WISH:[{acct:'everyday',saved:100}],FUNDS:[{acct:'everyday',saved:200}],
    GOALS:[{acct:'everyday',alloc:[{amt:300}]}]});
  const before=r.run('JSON.stringify({ACCTS,TXNS,WISH,FUNDS,GOALS,BUFFERS})');
  r.run("safeSpend();forecastAccount('everyday');offsetImpact({id:'house',rate:6,minRepay:100,offsetAccountIds:[]})");
  assert.equal(r.run('JSON.stringify({ACCTS,TXNS,WISH,FUNDS,GOALS,BUFFERS})'),before);
});
