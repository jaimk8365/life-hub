import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../finance/app.html',import.meta.url),'utf8');
const client=readFileSync(new URL('../finance/pocketsmith-client.js',import.meta.url),'utf8');
const importer=readFileSync(new URL('../finance/pocketsmith-import.js',import.meta.url),'utf8');

test('Finance loads the PocketSmith importer before the API client',()=>{
  const importerPos=app.indexOf('pocketsmith-import.js');
  const clientPos=app.indexOf('pocketsmith-client.js');
  assert.ok(importerPos>=0);
  assert.ok(clientPos>importerPos);
});

test('PocketSmith API sync is not marked complete until Finance importer runs',()=>{
  assert.match(client,/await window\.PocketSmithImporter\.apply\(data\)/);
  assert.ok(client.indexOf('PocketSmithImporter.apply(data)')<client.indexOf('localStorage.setItem(LAST_SYNC_KEY'));
});

test('first importer deployment forces a full transaction snapshot instead of trusting an older fetch timestamp',()=>{
  assert.match(client,/IMPORT_VERSION_KEY/);
  assert.match(client,/importerCurrent && last \? '\?updated_since='/);
  assert.match(client,/localStorage\.setItem\(IMPORT_VERSION_KEY, IMPORT_VERSION\)/);
});

test('importer reconciles displayed Finance balance back to PocketSmith current balance',()=>{
  assert.match(importer,/acct\.openBal=Math\.round\(\(Number\(b\.balance\)-total\)\*100\)\/100/);
  assert.match(importer,/target:Number\(b\.balance\)/);
  assert.match(importer,/calculated:Math\.round/);
});

test('importer persists accounts and transactions through Finance storage contracts',()=>{
  assert.match(importer,/typeof K_ACCTS/);
  assert.match(importer,/typeof K_TXNS/);
  assert.match(importer,/save\(accountsKey,ACCTS\)/);
  assert.match(importer,/save\(txnsKey,TXNS\)/);
});

test('PocketSmith transactions are deduplicated using external IDs and same-date amount matching',()=>{
  assert.match(importer,/pocketsmithId/);
  assert.match(importer,/importKey:'pocketsmith:'/);
  assert.match(importer,/existingMatch\(existing,row\)/);
});
