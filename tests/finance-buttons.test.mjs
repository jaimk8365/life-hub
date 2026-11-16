import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// Every button in Fix my numbers calls a function by name from the page. Async functions declared inside the
// page-only block are NOT global by themselves, which is how "Compare" silently did nothing. This runs the file
// as the browser would and checks every name a button calls is really there.
test('every function a Fix my numbers button calls exists on the page', () => {
  const src = readFileSync(new URL('../finance/fix-numbers.js', import.meta.url), 'utf8');
  const ctx = { addEventListener() {}, setTimeout() {}, console };
  ctx.window = ctx; ctx.document = { getElementById: () => null };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  const called = [...new Set([...src.matchAll(/onclick=\\?["']?(\w+)\(/g)].map(m => m[1]))].filter(n => n !== 'closeSheet' && n !== 'sortCheckOpen');
  assert.ok(called.includes('trustStatementSave') && called.includes('trustCsvOpen'));
  for (const name of called) assert.equal(typeof ctx[name], 'function', name + ' is reachable from a button');
});
