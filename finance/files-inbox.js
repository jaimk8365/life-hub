/* Files inbox: read receipts and bills on the device (PDF text first), pull out shop, amount, date and due date,
   match a receipt to a bank transaction, and suggest where it belongs. Pure logic; nothing leaves the device. */
(function(root,factory){const api=factory(root.FinDates||(typeof require==='function'?require('./fin-dates.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;else root.FinInbox=api;})(typeof globalThis==='object'?globalThis:this,function(D){
 'use strict';
 const MON={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
 const pad=n=>String(n).padStart(2,'0');
 const round=n=>Math.round((+n||0)*100)/100;
 function iso(y,m,d){y=+y;m=+m;d=+d;if(y<100)y+=2000;if(m<1||m>12||d<1||d>31||y<2000||y>2100)return null;const s=y+'-'+pad(m)+'-'+pad(d);try{return D.parse(s)&&s;}catch(e){return null;}}
 /* Every date written in a line of text (Australian day/month/year first). */
 function datesIn(line){
  const out=[];let m;
  const a=/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/g;while((m=a.exec(line)))out.push(iso(m[3].length===2?'20'+m[3]:m[3],m[2],m[1]));
  const b=/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(\d{2,4})\b/gi;while((m=b.exec(line)))out.push(iso(m[3].length===2?'20'+m[3]:m[3],MON[m[2].toLowerCase()],m[1]));
  const c=/\b(20\d{2})-(\d{2})-(\d{2})\b/g;while((m=c.exec(line)))out.push(iso(m[1],m[2],m[3]));
  return out.filter(Boolean);
 }
 function moneyIn(line){const out=[],re=/\$?\s*((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})\b/g;let m;while((m=re.exec(line)))out.push(round(parseFloat(m[1].replace(/,/g,''))));return out;}
 const GENERIC=/^(tax invoice|invoice|receipt|statement|abn|acn|page|date|tel|phone|ph:|www|http|email|customer|account|order|thank|your|bill to|ship to|paid|total|subtotal|gst)/i;
 function extractFields(text){
  const lines=String(text||'').split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const f={shop:'',amount:0,date:'',dueDate:'',kind:'unknown',found:0};
  if(!lines.length)return f;
  // amount: lines that say what is owed or the total beat everything else
  const prio=[/(amount\s*due|total\s*due|balance\s*due|please\s*pay|amount\s*payable|pay\s*this\s*amount)/i,/(grand\s*total|total\s*amount|total\s*\(?inc|\btotal\b)/i];
  for(const re of prio){
   for(let i=0;i<lines.length&&!f.amount;i++){if(re.test(lines[i])&&!/sub\s*total|gst\s*total/i.test(lines[i])){const m=moneyIn(lines[i]).concat(moneyIn(lines[i+1]||''));if(m.length)f.amount=m[0];}}
   if(f.amount)break;
  }
  if(!f.amount){const all=lines.flatMap(moneyIn);if(all.length)f.amount=Math.max(...all);}
  // dates: the line that says "due" gives the due date; the first other date is the document date
  for(const l of lines){const d=datesIn(l);if(!d.length)continue;if(/\bdue\b|pay\s*by|payable\s*by/i.test(l)){if(!f.dueDate)f.dueDate=d[d.length-1];}else if(!f.date)f.date=d[0];}
  if(!f.date){const any=lines.flatMap(datesIn).filter(d=>d!==f.dueDate);if(any.length)f.date=any[0];}
  // shop: first sensible line near the top
  const sup=lines.find(l=>/^(supplier|merchant|from|store)\s*[:\-]/i.test(l));
  if(sup)f.shop=sup.replace(/^[^:\-]+[:\-]\s*/,'').trim();
  else{const top=lines.slice(0,10).find(l=>/[A-Za-z]{3,}/.test(l)&&!GENERIC.test(l)&&(l.match(/\d/g)||[]).length<=l.length/3);if(top)f.shop=top;}
  f.shop=f.shop.replace(/\s+/g,' ').slice(0,40);
  const owing=!!f.dueDate||/(amount\s*due|please\s*pay|pay\s*by|due\s*date|balance\s*due)/i.test(text),paid=/(eftpos|visa|mastercard|change\s*due|thank you for (your )?(purchase|shopping)|cash\s*tendered|paid)/i.test(text);
  f.kind=owing&&!(paid&&!f.dueDate)?'bill':f.amount||f.date?'receipt':'unknown';
  f.found=['shop','amount','date'].filter(k=>f[k]).length;
  return f;
 }
 const tokens=s=>String(s||'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').split(/\s+/).filter(w=>w.length>=3);
 /* Match a receipt to a spend: same amount to the cent, within a few days, merchant words help break ties. */
 function matchTransaction(f,txns,opts){
  const today=(opts&&opts.today)||null,days=(opts&&opts.days)||3,anchor=f.date||today;
  if(!f.amount||!anchor)return null;
  const want=tokens(f.shop),cands=[];
  for(const t of txns||[]){
   if(t.deleted||!(t.amount<0)||t.cat==='transfer')continue;
   if(Math.abs(-t.amount-f.amount)>0.005)continue;
   const gap=Math.abs(D.diffDays(anchor,t.date));if(gap>(f.date?days:30))continue;
   const note=new Set(tokens(t.note));let overlap=0;for(const w of want)if(note.has(w)||[...note].some(n=>n.startsWith(w)||w.startsWith(n)))overlap++;
   cands.push({txn:t,gap,overlap,score:overlap*10-gap});
  }
  if(!cands.length)return null;
  cands.sort((a,b)=>b.score-a.score);
  return{txn:cands[0].txn,others:cands.length-1,sure:cands.length===1||cands[0].score>cands[1].score};
 }
 const shopRe=()=>{const extra=(globalThis.FIN_CONFIG||{}).shopWords;return new RegExp('postage|packaging|packing|mailer|sticker|shipping label|print\\s*shop|cardstock|laminat'+(extra?'|'+extra:''),'i');};
 const TAXY=/stationery|uniform|union|professional|membership|software|subscription|training|course|laptop|work\s*(boots|shirt)|tools?\b|home\s*office|internet|phone/i;
 /* Suggest where a document belongs. If it is unclear Pip should ask (ask:true). */
 function suggest(f,text){
  if(f.kind==='bill')return{dest:'bill',ask:false,why:'It asks for payment.'};
  const s=(f.shop||'')+' '+(text||'');
  if(shopRe().test(s))return{dest:'shop',ask:false,why:'Looks like shop supplies.'};
  if(TAXY.test(s))return{dest:'tax',ask:true,why:'Might be a tax deduction.'};
  return{dest:null,ask:true,why:'Is this Home, Tax or the shop?'};
 }
 /* ---- PDF text, on the device ---- */
 const latin=bytes=>{let s='';const step=0x8000;for(let i=0;i<bytes.length;i+=step)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+step));return s;};
 function unescapePdf(s){return s.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g,(m,c)=>{if(c.length>1||/[0-7]/.test(c))return String.fromCharCode(parseInt(c,8));return({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f','(':'(',')':')','\\':'\\'})[c];});}
 async function inflate(bytes){
  const ds=new DecompressionStream('deflate'),w=ds.writable.getWriter();w.write(bytes).catch(()=>{});w.close().catch(()=>{});
  const chunks=[],r=ds.readable.getReader();for(;;){const {done,value}=await r.read();if(done)break;chunks.push(value);}
  let n=0;chunks.forEach(c=>n+=c.length);const out=new Uint8Array(n);let o=0;chunks.forEach(c=>{out.set(c,o);o+=c.length;});return out;
 }
 function textFromContent(c){
  const out=[];const re=/\[((?:[^\]\\]|\\.)*)\]\s*TJ|\(((?:\\.|[^\\)])*)\)\s*(?:Tj|'|")|\bT\*|\bTd\b|\bTD\b|\bET\b/g;let m;
  while((m=re.exec(c))){
   if(m[1]!=null){const parts=[],sr=/\(((?:\\.|[^\\)])*)\)|(-?\d+(?:\.\d+)?)/g;let p;while((p=sr.exec(m[1]))){if(p[1]!=null)parts.push(unescapePdf(p[1]));else if(+p[2]<-200)parts.push(' ');}out.push(parts.join(''));}
   else if(m[2]!=null)out.push(unescapePdf(m[2]));
   else out.push('\n');
  }
  return out.join('').replace(/[ \t]*\n[ \t]*/g,'\n').replace(/\n{3,}/g,'\n\n');
 }
 async function pdfText(bytes){
  const src=latin(bytes);let text='';const re=/(?<![a-z])stream\r?\n/g;let m;
  while((m=re.exec(src))){
   const start=m.index+m[0].length,end=src.indexOf('endstream',start);if(end<0)break;
   const head=src.slice(Math.max(0,m.index-400),m.index),isFlate=/FlateDecode/.test(head.slice(Math.max(0,head.lastIndexOf('<<'))));
   let stop=end;while(stop>start&&(src.charCodeAt(stop-1)===10||src.charCodeAt(stop-1)===13))stop--;   // the line break before endstream is not data
   let body=bytes.subarray(start,stop);
   try{if(isFlate)body=await inflate(body);}catch(e){continue;}
   const c=latin(body);if(/\bBT\b/.test(c)&&/T[jJ]/.test(c))text+=textFromContent(c)+'\n';
   re.lastIndex=end+9;   // skip past the word endstream so its tail is not mistaken for a new stream
  }
  return text.trim();
 }
 return{extractFields,matchTransaction,suggest,pdfText,datesIn,moneyIn,textFromContent};
});
