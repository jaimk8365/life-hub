import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// On a wide Mac window Finance drew its own dark sidebar right next to the Life Hub menu: two left menus,
// and the one nearest Finance has no Today. Inside Life Hub, Finance keeps its tabs at the bottom instead.
test('Finance inside Life Hub never shows a second left menu', () => {
  const css = read('finance/home-redesign.css');
  const wide = css.slice(css.indexOf('@media(min-width:1024px){'));
  const block = wide.slice(0, wide.indexOf('\n}') + 2);
  for (const rule of ['body.fin-redesign{padding-left:248px}', '.fn{inset:0 auto 0 0', '.fn-bar{position:static']) {
    const at = block.indexOf(rule);
    assert.ok(at > 0, rule + ' is still there for Finance on its own');
    assert.ok(block.slice(Math.max(0, at - 30), at).includes('html:not(.fin-in-hub)'), rule + ' only applies outside Life Hub');
  }
});

test('Finance knows when it is inside Life Hub (and only then)', () => {
  const full = read('finance/home-redesign.js');
  const src = full.slice(full.indexOf('/* Inside Life Hub'));
  assert.ok(src.includes('fin-in-hub'));
  const run = parentDoc => {
    const classes = new Set();
    const win = {};
    win.parent = parentDoc ? { document: parentDoc } : win;
    const ctx = { window: win, document: { documentElement: { classList: { add: c => classes.add(c) } } } };
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    return classes.has('fin-in-hub');
  };
  const hub = { getElementById: id => (id === 'b-finance' || id === 'f-finance') ? {} : null };
  const app = { getElementById: id => id === 'f-finance' ? {} : null }; // My Finance on its own keeps its sidebar
  assert.equal(run(hub), true);
  assert.equal(run(app), false);
  assert.equal(run(null), false);
});

// Opening the hub waits for sync before it picks a section. A tap on the menu in that moment used to get
// undone a few seconds later (e.g. back to Finance from a ?tab=finance link). Now the tap wins.
test('a menu tap during start-up is never undone by start-up', () => {
  const html = read('index.html');
  assert.match(html, /addEventListener\('pointerdown', e => \{ if \(!booted && [^}]*navTouched = true/);
  const boot = html.slice(html.indexOf('const boot = () => {'), html.indexOf("window.addEventListener('lifehub-sync-ready', boot"));
  const guard = boot.indexOf("if (navTouched && document.querySelector('iframe.active')) return;");
  assert.ok(guard > 0, 'start-up stops if you already picked a section');
  assert.ok(guard < boot.indexOf("query.get('tab')==='finance'"), 'checked before the Finance link reopens Finance');
  assert.ok(guard < boot.indexOf('3 * 3600000'), 'checked before the "after a break" jump');
  assert.ok(boot.indexOf('navMeSet(true)') < guard, 'your folded menu still comes back');
});
