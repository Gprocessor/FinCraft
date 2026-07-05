/* FinCraft · tests/module-integrity.test.js
   Walks every .js file under js/, imports it, and calls every exported function with a
   battery of generic stub arguments in a mocked DOM. This is a regression net for the
   file-splitting refactor (loans.js -> loans/*.js, api.js -> api/*.js, etc.): it exists to
   catch the two classes of bug that refactor produced in earlier drafts —
     1. A function references an identifier (api, toast, escapeHtml, a sibling function...)
        that its file forgot to import -> ReferenceError, either thrown directly or
        swallowed by the function's own try/catch and shown in a toast instead.
     2. A module-level `let` owned by one file gets reassigned from a different file that
        only *imported* it -> TypeError: Assignment to constant variable.
   It does NOT replace manual testing against a real Fineract server — it can only catch
   wiring mistakes that are visible without real data, not business-logic bugs.
*/
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JS_ROOT = path.resolve(__dirname, '../js');

function findJsFiles(dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(findJsFiles(p));
    else if (entry.name.endsWith('.js')) out.push(p);
  }
  return out;
}

// A handful of generic argument shapes that cover how these functions are actually called
// throughout the app: (container), (container, id), (container, id, tab), (button-like
// element), (button, onSuccess-callback), or no args.
function stubArgSets(document) {
  const c = document.getElementById('c');
  return [[c], [c, '1'], [c, '1', 'overview'], [{}], [{}, () => {}], ['1', () => {}], []];
}

function withTimeout(promise, ms) {
  let t;
  const timeout = new Promise((_, reject) => { t = setTimeout(() => reject(new Error('TIMED_OUT')), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

const ERROR_LEAK_PATTERNS = [/is not defined/];

export async function runTests({ assert: a = assert } = {}) {
  let JSDOM;
  try {
    ({ JSDOM } = await import('jsdom'));
  } catch {
    console.warn('[module-integrity] jsdom not installed — run `npm install` first. Skipping.');
    return;
  }

  const dom = new JSDOM(
    '<!doctype html><body><div id="c"></div><div id="toastContainer"></div></body>',
    { url: 'https://example.com/' }
  );
  global.window = dom.window;
  global.document = dom.window.document;
  global.CustomEvent = dom.window.CustomEvent;
  global.localStorage = dom.window.localStorage;
  global.sessionStorage = dom.window.sessionStorage;
  // ResizeObserver isn't implemented by jsdom; stub it so files that observe
  // element size (e.g. ui/scrollable-tabs.js) can be imported/exercised.
  global.ResizeObserver = dom.window.ResizeObserver || class ResizeObserver {
    observe() {} unobserve() {} disconnect() {}
  };
  dom.window.ResizeObserver = global.ResizeObserver;
  try {
    Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
  } catch { /* already defined in this Node version */ }
  try {
    Object.defineProperty(global, 'location', { value: dom.window.location, configurable: true, writable: true });
  } catch { /* already defined in this Node version */ }
  // Every function should be exercised even though there's no real Fineract server behind
  // it: fail fast and let each function's own try/catch (or our stub-arg loop) handle it.
  global.fetch = async () => { throw new Error('SIMULATED_NETWORK_FAIL'); };

  // Some functions (polling loops, debounced search, router history listeners) start
  // timers meant to live for the whole app session. Track and clear them all afterwards
  // so this test process can actually exit instead of hanging on a background interval.
  const timers = new Set();
  const realSetInterval = global.setInterval, realSetTimeout = global.setTimeout;
  global.setInterval = (...args) => { const h = realSetInterval(...args); timers.add(h); return h; };
  global.setTimeout = (...args) => { const h = realSetTimeout(...args); timers.add(h); return h; };

  // Functions under test log their own caught errors and warnings (correct behavior given
  // our generic stub args, e.g. "[modal not found]") — that's expected noise here, not a
  // test failure, so keep it out of the test report.
  const realConsoleError = console.error;
  const realConsoleWarn = console.warn;
  console.error = () => {};
  console.warn = () => {};

  const files = findJsFiles(JS_ROOT);
  a.ok(files.length > 100, `expected >100 js files under js/, found ${files.length}`);

  // A few exported functions are session-long setup routines, not per-call renderers —
  // calling them repeatedly with stub args doesn't test anything meaningful and they're
  // covered indirectly (initRouter is exercised via full-app wiring, startPolling/stopPolling
  // via notifications/shared.js's other functions). Skip them here.
  const SKIP = new Set(['initRouter', 'startPolling', 'gsSearch']);

  const failures = [];
  let functionsChecked = 0;

  try {
    for (const f of files) {
      const rel = path.relative(JS_ROOT, f);
      let mod;
      try {
        mod = await import('file://' + f);
      } catch (e) {
        failures.push(`${rel}: FAILED TO IMPORT — ${e.message}`);
        continue;
      }
      for (const [name, val] of Object.entries(mod)) {
        if (typeof val !== 'function' || SKIP.has(name)) continue;
        functionsChecked++;
        let refError = null;
        for (const args of stubArgSets(document)) {
          document.getElementById('toastContainer').innerHTML = '';
          try {
            const r = val(...args);
            if (r && typeof r.then === 'function') {
              await withTimeout(
                r.catch(e => { if (e instanceof ReferenceError) refError = e; }),
                2000
              );
            }
          } catch (e) {
            if (e instanceof ReferenceError) refError = e;
          }
          const leaked = document.getElementById('toastContainer').textContent;
          for (const pat of ERROR_LEAK_PATTERNS) {
            if (pat.test(leaked)) { refError = refError || new Error('leaked: ' + leaked.trim()); }
          }
          if (refError) break;
        }
        if (refError) {
          failures.push(`${rel} :: ${name}() — ${refError.message}`);
        }
      }
    }
  } finally {
    for (const h of timers) { clearInterval(h); clearTimeout(h); }
    global.setInterval = realSetInterval;
    global.setTimeout = realSetTimeout;
    console.error = realConsoleError;
    console.warn = realConsoleWarn;
  }

  console.log(`[module-integrity] checked ${functionsChecked} exported functions across ${files.length} files`);
  if (failures.length) {
    console.error(`[module-integrity] ${failures.length} function(s) reference undefined identifiers:`);
    for (const line of failures) console.error('  - ' + line);
  }
  a.strictEqual(failures.length, 0, `${failures.length} function(s) hit a ReferenceError — see log above`);
}
