import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
const F=createRequire(import.meta.url)('../finance/files-inbox.js');
const receipt=`Woolworths Ipswich
ABN 88 000 014 675
TAX INVOICE
Date: 14/10/2026
Milk 2L   $4.20
Bread     $3.80
Subtotal  $8.00
GST       $0.00
Total     $54.20
EFTPOS Visa  $54.20
Thank you for shopping`;
const bill=`Energex Electricity
Tax Invoice
Issue date 02 October 2026
Amount due $312.45
Due date 23/10/2026
Please pay by the due date`;
test('receipt: shop, amount, date and kind are pulled out',()=>{
 const f=F.extractFields(receipt);
 assert.equal(f.shop,'Woolworths Ipswich');assert.equal(f.amount,54.2);assert.equal(f.date,'2026-10-14');assert.equal(f.dueDate,'');assert.equal(f.kind,'receipt');assert.equal(f.found,3);
});
test('bill: amount due and due date are pulled out and it is a bill',()=>{
 const f=F.extractFields(bill);
 assert.equal(f.shop,'Energex Electricity');assert.equal(f.amount,312.45);assert.equal(f.dueDate,'2026-10-23');assert.equal(f.date,'2026-10-02');assert.equal(f.kind,'bill');
});
test('dates in several shapes, and impossible ones are rejected',()=>{
 assert.deepEqual(F.datesIn('Paid 5-3-26 and 18 Oct 2026 and 2026-10-19'),['2026-03-05','2026-10-18','2026-10-19']);
 assert.deepEqual(F.datesIn('31/02/2026'),[]);
});
test('empty or messy text never throws',()=>{assert.equal(F.extractFields('').kind,'unknown');assert.equal(F.extractFields(null).amount,0);assert.equal(F.extractFields('hello world').kind,'unknown');});
test('a receipt is matched to the right bank spend, even with similar ones around',()=>{
 const f=F.extractFields(receipt),txns=[{id:'a',date:'2026-10-14',amount:-54.2,note:'WOOLWORTHS IPSWICH QLD'},{id:'b',date:'2026-10-15',amount:-54.2,note:'BP Petrol'},{id:'c',date:'2026-10-14',amount:-54.25,note:'Woolworths'},{id:'d',date:'2026-10-14',amount:54.2,note:'Refund'}];
 const m=F.matchTransaction(f,txns,{today:'2026-10-18'});assert.equal(m.txn.id,'a');assert.equal(m.sure,true);
 assert.equal(F.matchTransaction(f,[{id:'z',date:'2026-09-01',amount:-54.2,note:'Woolworths'}],{today:'2026-10-18'}),null,'too far in time');
 assert.equal(F.matchTransaction({amount:0},txns,{today:'2026-10-18'}),null);
});
test('Pip suggests where a document belongs, and asks when unclear',()=>{
 assert.equal(F.suggest(F.extractFields(bill),bill).dest,'bill');
 const etsy='Australia Post\nPostage satchels\nTotal $23.00\n12/10/2026';assert.equal(F.suggest(F.extractFields(etsy),etsy).dest,'etsy');
 const plain='Kmart\nTotal $12.00\n12/10/2026';const s=F.suggest(F.extractFields(plain),plain);assert.equal(s.dest,null);assert.equal(s.ask,true);
 const tax='Officeworks\nStationery\nTotal $12.00\n12/10/2026';assert.equal(F.suggest(F.extractFields(tax),tax).dest,'tax');
});
test('text is read out of a real compressed PDF on the device',async()=>{
 const content='BT /F1 12 Tf 72 700 Td (Bunnings Warehouse) Tj 0 -14 Td (Date: 14/10/2026) Tj 0 -14 Td [(Total ) -300 ($89.50)] TJ ET';
 const z=zlib.deflateSync(Buffer.from(content,'latin1'));
 const pdf=Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj\n<< /Length '+z.length+' /Filter /FlateDecode >>\nstream\n','latin1'),z,Buffer.from('\nendstream\nendobj\n%%EOF','latin1')]);
 const text=await F.pdfText(new Uint8Array(pdf));
 assert.match(text,/Bunnings Warehouse/);assert.match(text,/Date: 14\/10\/2026/);
 const f=F.extractFields(text);assert.equal(f.amount,89.5);assert.equal(f.date,'2026-10-14');assert.equal(f.shop,'Bunnings Warehouse');
 assert.equal(await F.pdfText(new Uint8Array(Buffer.from('not a pdf'))),'');
});

test('text is found when the PDF has several streams and the page content is not the first',async()=>{
 const mk=(dict,body)=>Buffer.concat([Buffer.from('<< '+dict+' >>\nstream\n','latin1'),body,Buffer.from('\nendstream\nendobj\n','latin1')]);
 const font=mk('/Length 20 /Filter /FlateDecode',zlib.deflateSync(Buffer.from('binary font data \x00\x01 no text ops')));
 const page=mk('/Length 99 /Filter /FlateDecode',zlib.deflateSync(Buffer.from('BT (Kmart Ipswich) Tj 0 -14 Td (Total $23.00) Tj ET','latin1')));
 const plain=mk('/Length 30',Buffer.from('BT (Plain text stream) Tj ET','latin1'));
 const pdf=Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj\n','latin1'),font,Buffer.from('2 0 obj\n','latin1'),page,Buffer.from('3 0 obj\n','latin1'),plain,Buffer.from('%%EOF')]);
 const text=await F.pdfText(new Uint8Array(pdf));
 assert.match(text,/Kmart Ipswich/);assert.match(text,/Total \$23\.00/);assert.match(text,/Plain text stream/);
});
