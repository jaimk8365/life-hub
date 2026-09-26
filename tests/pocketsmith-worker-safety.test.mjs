import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../finance/pocketsmith-sync/worker.js',import.meta.url),'utf8');

test('PocketSmith worker keeps developer credentials in Cloudflare environment variables',()=>{
  assert.match(source,/env\.POCKETSMITH_DEVELOPER_KEY/);
  assert.match(source,/env\.APP_SYNC_TOKEN/);
  assert.doesNotMatch(source,/ghp_|pk_live_|password\s*=/i);
});

test('PocketSmith snapshot does not expose bank account numbers or BSB fields',()=>{
  assert.doesNotMatch(source,/account_number\s*:/i);
  assert.doesNotMatch(source,/\bbsb\s*:/i);
});

test('initial PocketSmith history import stays below Cloudflare Free subrequest ceiling',()=>{
  assert.match(source,/page <= 40/);
  assert.match(source,/per_page: "1000"/);
  assert.match(source,/batch\.length < 1000/);
});

test('browser authorization requests require an approved Finance origin',()=>{
  assert.match(source,/access-control-allow-origin/);
  assert.match(source,/origin_not_allowed/);
  assert.match(source,/https:\/\/jaimk8365\.github\.io/);
});

test('snapshot uses transaction accounts and supports incremental updates',()=>{
  assert.match(source,/transaction_accounts/);
  assert.match(source,/updated_since/);
});
