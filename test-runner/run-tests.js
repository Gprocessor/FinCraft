import fs from 'fs';
import path from 'path';
import assert from 'assert';

const testsDir = path.resolve(process.cwd(), 'tests');
if (!fs.existsSync(testsDir)) {
  console.log('No tests directory found.');
  process.exit(0);
}

const files = fs.readdirSync(testsDir).filter(f => f.endsWith('.test.js'));
if (!files.length) {
  console.log('No test files found.');
  process.exit(0);
}

let passed = 0, failed = 0;
for (const file of files) {
  const p = path.join(testsDir, file);
  try {
    const mod = await import('file://' + p);
    if (typeof mod.runTests !== 'function') {
      console.warn(`${file}: no exported runTests()`);
      continue;
    }
    await mod.runTests({ assert });
    console.log(`PASS: ${file}`);
    passed++;
  } catch (err) {
    console.error(`FAIL: ${file}`);
    console.error(err.stack || err);
    failed++;
  }
}

console.log(`\nTests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
