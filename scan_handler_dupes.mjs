import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

function extractExportedObjectKeys(file) {
  const src = readFileSync(file, 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'module', locations: true });
  const results = []; // {exportName, keys: [{key, line}]}
  walk.simple(ast, {
    ExportNamedDeclaration(node) {
      const decl = node.declaration;
      if (!decl || decl.type !== 'VariableDeclaration') return;
      for (const d of decl.declarations) {
        if (!d.init || d.init.type !== 'ObjectExpression') continue;
        const keys = [];
        for (const prop of d.init.properties) {
          if (prop.type !== 'Property' || prop.computed) continue;
          let key = null;
          if (prop.key.type === 'Identifier') key = prop.key.name;
          else if (prop.key.type === 'Literal') key = String(prop.key.value);
          if (key !== null) keys.push({ key, line: prop.key.loc.start.line });
        }
        results.push({ exportName: d.id.name, keys });
      }
    },
  });
  return results;
}

const dir = 'js/ui/handlers';
const files = readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'index.js').map(f => join(dir, f));

const globalKeyOwner = new Map(); // key -> [{file, exportName, line}]
for (const file of files) {
  let exps;
  try { exps = extractExportedObjectKeys(file); } catch (e) { console.log(`PARSE ERROR ${file}: ${e.message}`); continue; }
  for (const { exportName, keys } of exps) {
    // Only consider objects that look like a handler registry (name ends with "Handlers")
    if (!/Handlers$/.test(exportName)) continue;
    for (const { key, line } of keys) {
      if (!globalKeyOwner.has(key)) globalKeyOwner.set(key, []);
      globalKeyOwner.get(key).push({ file, exportName, line });
    }
  }
}

let dupes = 0;
for (const [key, owners] of globalKeyOwner) {
  if (owners.length > 1) {
    dupes++;
    console.log(`DUP-ACTION "${key}":`);
    for (const o of owners) console.log(`    ${o.file}:${o.line} (${o.exportName})`);
  }
}
console.log(`\nTotal duplicate action keys across handler registries: ${dupes}`);
console.log(`Total distinct action keys scanned: ${globalKeyOwner.size}`);
