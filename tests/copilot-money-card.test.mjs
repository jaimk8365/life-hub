import test from 'node:test';
import assert from 'node:assert/strict';
import { moneyCard } from '../copilot/engine.mjs';

test('Co-Pilot money card: fresh note shown, stale note not trusted, Wednesday nudges payday, done is quiet', () => {
  assert.equal(moneyCard({ date: '2026-11-04', kind: 'payday', status: 'due', text: 'Payday reset is ready (10 to 15 minutes).' }, '2026-11-04').title, 'Payday Reset');
  assert.equal(moneyCard({ date: '2026-11-04', kind: 'payday', status: 'resume', text: 'Carry on' }, '2026-11-04').action, 'Carry on');
  assert.equal(moneyCard({ date: '2026-11-03', kind: null, status: 'done', text: 'done' }, '2026-11-04', 'Wednesday').title, 'Payday Reset', 'yesterday\'s "done" does not hide today');
  assert.equal(moneyCard(null, '2026-11-05', 'Thursday').action, 'Open Finance');
  const done = moneyCard({ date: '2026-11-05', kind: null, status: 'done', text: 'x' }, '2026-11-05');
  assert.equal(done.tone, 'done'); assert.equal(done.action, null);
  assert.equal(moneyCard('rubbish', '2026-11-05').tone, 'soft');
});
