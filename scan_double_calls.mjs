import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

function listJsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.git') continue;
      listJsFiles(p, out);
    } else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

function calleeSource(node, src) {
  // Reconstruct dotted callee path text, e.g. "api.loans.approve"
  return src.slice(node.callee.start, node.callee.end);
}

const files = listJsFiles('js');
let issues = 0;

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  let ast;
  try {
    ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'module', locations: true });
  } catch { continue; }

  // Find enclosing "function-like" nodes and scan their direct source for api.* calls
  const funcTypes = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
  walk.simple(ast, {
    FunctionDeclaration(n) { checkFn(n); },
    FunctionExpression(n) { checkFn(n); },
    ArrowFunctionExpression(n) { checkFn(n); },
  });

  function checkFn(fnNode) {
    // Only look at calls whose nearest enclosing function is this one (approx: collect all
    // CallExpressions inside fnNode.body, but skip ones nested inside a deeper function —
    // we approximate by just collecting all and it's fine for a manual-review heuristic).
    const calls = [];
    walk.simple(fnNode.body, {
      CallExpression(cn) {
        if (cn.callee.type === 'MemberExpression') {
          const calleeTxt = calleeSource(cn, src);
          if (/^api\.\w+\.\w+$/.test(calleeTxt)) {
            const argsTxt = src.slice(cn.start, cn.end);
            calls.push({ calleeTxt, argsTxt, line: cn.loc.start.line });
          }
        }
      },
    });
    const seen = new Map();
    for (const c of calls) {
      const key = c.argsTxt.replace(/\s+/g, ' ');
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push(c.line);
    }
    for (const [key, lines] of seen) {
      if (lines.length > 1) {
        issues++;
        console.log(`DOUBLE-CALL ${file}: "${key.slice(0, 90)}" called at lines ${lines.join(', ')}`);
      }
    }
  }
}

console.log(`\nTotal repeated-identical-api-call issues: ${issues}`);
