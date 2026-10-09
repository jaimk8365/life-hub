import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {patchPartnerFinanceEvidence} from '../tools/partner-finance-evidence-patches.mjs';

const source=readFileSync(new URL('../src/partner-finance.html',import.meta.url),'utf8');
function productionFunction(name){
  const lines=source.split('\n'),start=lines.findIndex(line=>line.startsWith(`function ${name}(`));
  if(start<0)throw new Error(`Missing partner function: ${name}`);
  for(let end=start;end<lines.length;end++){
    const code=lines.slice(start,end+1).join('\n');
    try{new vm.Script(code);return code;}catch{}
  }
  throw new Error(`Unterminated partner function: ${name}`);
}
function runtime(weeklyPlan={}){
  const ctx=vm.createContext({
    SHARED:{evidenceTrusted:true,weeklyPlan:{routineAllowance:0,transfers:0,upcomingBills:0,billsDue:[],billsTransfer:0,...weeklyPlan},pendingOneoffs:[],accountForecasts:[]},
    WEEK_PLAN:{selectedCats:[],oneOffs:[]},CAT_BUDGET:{},CAT_NAMES:{},BUFFERS:{everyday:100},
    acctOf:id=>({id,balance:id==='everyday'?1000:0}),
    esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    AUD0:n=>`AUD ${Number(n).toFixed(0)}`,infoButton:()=>'',save:()=>{throw new Error('A shared calculation must not write');},
  });
  for(const name of ['accountForecast','partnerAccountForecast','buildWeeklyEverydayPlan','partnerLiveSafeSpend','partnerSafeSpend'])vm.runInContext(productionFunction(name),ctx);
  return {ctx,run:code=>vm.runInContext(code,ctx)};
}

test('Partner Safe to Spend protects published goals and funds without counting wishlist twice',()=>{
  const r=runtime({reserved:800,wishlist:100});
  assert.equal(r.run('buildWeeklyEverydayPlan().remaining'),100);
  assert.equal(r.run('partnerLiveSafeSpend().safe'),100);
  assert.equal(r.run('partnerLiveSafeSpend().reserved'),800);
  const card=r.run('partnerSafeSpend()');
  assert.match(card,/AUD 800.*reserved/);
  assert.match(card,/goals, funds and wishlist/);
});

test('An older shared snapshot retains the existing wishlist reservation fallback',()=>{
  const r=runtime({wishlist:100});
  assert.equal(r.run('buildWeeklyEverydayPlan().remaining'),800);
  assert.equal(r.run('partnerLiveSafeSpend().reserved'),100);
});

test('An explicit zero reservation does not fall back to the older wishlist field',()=>{
  const r=runtime({reserved:0,wishlist:100});
  assert.equal(r.run('buildWeeklyEverydayPlan().remaining'),900);
  assert.equal(r.run('partnerLiveSafeSpend().reserved'),0);
});

test('Untrusted and legacy account forecasts show a pause without numeric amounts',()=>{
  for(const trusted of [false,undefined]){
    const r=runtime();
    r.ctx.SHARED.accountForecasts=[{id:'everyday',trusted,haveData:true,predicted:900,daily:10,scheduledTotal:20,evidence:{reason:'Balance <needs> review'}}];
    const card=r.run('partnerAccountForecast({id:"everyday",name:"Everyday"})');
    assert.match(card,/Forecast paused/);
    assert.match(card,/Balance &lt;needs&gt; review/);
    assert.doesNotMatch(card,/AUD/);
  }
});

test('Only trusted forecasts with reviewed history and a finite amount display an outlook',()=>{
  const r=runtime();
  r.ctx.SHARED.accountForecasts=[{id:'everyday',trusted:true,haveData:true,predicted:900,daily:10,scheduledTotal:20}];
  assert.match(r.run('partnerAccountForecast({id:"everyday",name:"Everyday"})'),/AUD 900/);
  r.ctx.SHARED.accountForecasts[0].haveData=false;
  assert.doesNotMatch(r.run('partnerAccountForecast({id:"everyday",name:"Everyday"})'),/AUD/);
  r.ctx.SHARED.accountForecasts[0].haveData=true;
  r.ctx.SHARED.accountForecasts[0].predicted=NaN;
  assert.doesNotMatch(r.run('partnerAccountForecast({id:"everyday",name:"Everyday"})'),/AUD/);
});

test('Partner calculations preserve shared snapshots and user choices',()=>{
  const r=runtime({reserved:800,wishlist:100}),before=r.run('JSON.stringify({SHARED,WEEK_PLAN,BUFFERS})');
  r.run('buildWeeklyEverydayPlan();partnerLiveSafeSpend();partnerSafeSpend()');
  assert.equal(r.run('JSON.stringify({SHARED,WEEK_PLAN,BUFFERS})'),before);
});

test('Partner compatibility patch is idempotent and rejects incomplete or unexpected input',()=>{
  assert.equal(patchPartnerFinanceEvidence(source),source);
  assert.throws(()=>patchPartnerFinanceEvidence(source.replace('published.reserved??published.wishlist??0','published.wishlist??0')),/incomplete/);
  assert.throws(()=>patchPartnerFinanceEvidence(source+'\n/* Partner Finance evidence safety v1 */'),/duplicated/);
  assert.throws(()=>patchPartnerFinanceEvidence('function partnerAccountForecast(a){}'),/source changed/);
});
