import assert from 'assert';
import { fmt, num, ini, escapeHtml, buildHash, parseHash, timeout, fmtDate } from '../js/utils.js';

export async function runTests({ assert: a = assert } = {}) {
  // fmt/num null handling
  a.strictEqual(fmt(null), '—');
  a.strictEqual(num(null), '—');

  // ini
  a.strictEqual(ini('John Doe'), 'JD');
  a.strictEqual(ini('Single'), 'S');
  a.strictEqual(ini(''), '?');

  // escapeHtml
  a.strictEqual(escapeHtml('<&>"\''), '&lt;&amp;&gt;&quot;&#39;');

  // buildHash/parseHash roundtrip
  const h1 = buildHash('dashboard');
  a.strictEqual(h1, '#dashboard');
  const h2 = buildHash('page', { id: '123' });
  a.strictEqual(h2, '#page/123');
  const h3 = buildHash('page', { a: 'x', b: 'y' });
  a.strictEqual(h3.startsWith('#page/'), true);

  // parseHash needs a global location
  globalThis.location = { hash: '#/page/123' };
  const ph = parseHash();
  a.strictEqual(ph.page, 'page');
  a.strictEqual(ph.params.id, '123');

  // timeout resolves and times out
  await timeout(Promise.resolve(5), 500);
  let timedOut = false;
  try {
    await timeout(new Promise(r => setTimeout(r, 200)), 50);
  } catch (e) {
    timedOut = /Timeout/.test(String(e));
  }
  a.strictEqual(timedOut, true);

  // fmtDate
  const d = fmtDate([2020, 1, 2]);
  a.strictEqual(typeof d, 'string');
  a.strictEqual(d.includes('2020'), true);
}
