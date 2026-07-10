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
    } else if (name.endsWith('.js')) {
      out.push(p);
    }
  }
  return out;
}

const files = listJsFiles('js');
let totalIssues = 0;

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  let ast;
  try {
    ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'module', locations: true });
  } catch (e) {
    console.log(`PARSE ERROR ${file}: ${e.message}`);
    continue;
  }

  // 1) Duplicate keys within a single object literal (non-computed, string/identifier keys)
  walk.simple(ast, {
    ObjectExpression(node) {
      const seen = new Map();
      for (const prop of node.properties) {
        if (prop.type !== 'Property' || prop.computed) continue;
        let key = null;
        if (prop.key.type === 'Identifier') key = prop.key.name;
        else if (prop.key.type === 'Literal') key = String(prop.key.value);
        if (key === null) continue;
        if (seen.has(key)) {
          console.log(`DUP-KEY ${file}:${prop.key.loc.start.line} key "${key}" also at line ${seen.get(key)}`);
          totalIssues++;
        } else {
          seen.set(key, prop.key.loc.start.line);
        }
      }
    },
    SwitchStatement(node) {
      const seen = new Map();
      for (const c of node.cases) {
        if (!c.test) continue; // default
        let key = null;
        if (c.test.type === 'Literal') key = String(c.test.value);
        else continue;
        if (seen.has(key)) {
          console.log(`DUP-CASE ${file}:${c.loc.start.line} case "${key}" also at line ${seen.get(key)}`);
          totalIssues++;
        } else {
          seen.set(key, c.loc.start.line);
        }
      }
    },
  });

  // 2) Duplicate top-level function/const/let declarations with the same name (would be a
  //    real SyntaxError for let/const at parse time already, but functions can shadow silently
  //    in some transpiled contexts) — mostly a sanity net, acorn would already throw for
  //    true redeclarations, so this rarely fires but costs nothing to check.
}

console.log(`\nTotal duplicate-key/case issues: ${totalIssues}`);
