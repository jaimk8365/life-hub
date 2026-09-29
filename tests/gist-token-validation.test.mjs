import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../sync.js',import.meta.url),'utf8');

test('Life Hub validates replacement tokens against Gist access, not unrelated profile access',()=>{
  assert.match(source,/gh\('\/gists\?per_page=1'\)/);
  assert.doesNotMatch(source,/gh\('\/user'\)/);
});

test('Life Hub distinguishes invalid tokens from missing Gist permission',()=>{
  assert.match(source,/may be expired or revoked/);
  assert.match(source,/does not have permission to read\/write Gists/);
});
