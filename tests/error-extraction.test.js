import assert from 'assert';
import { extractFineractError } from '../js/ui/dom-helpers.js';

export async function runTests({ assert: a = assert } = {}) {
  // Multi-field validation failure: must surface EVERY field, not just errors[0],
  // and must NOT fall back to the generic top-level wrapper text.
  const multiField = extractFineractError({
    detail: {
      defaultUserMessage: 'Validation errors exist.',
      errors: [
        { parameterName: 'name', defaultUserMessage: 'The parameter name cannot be blank.' },
        { parameterName: 'officeId', defaultUserMessage: 'The parameter officeId cannot be blank.' },
      ],
    },
  });
  a.ok(!multiField.includes('Validation errors exist.'), 'should not fall back to generic wrapper when errors[] is populated');
  a.ok(multiField.includes('name'), 'should include the first field name');
  a.ok(multiField.includes('officeId'), 'should include the second field name');
  a.ok(multiField.includes('\n'), 'multiple field errors should be newline-separated');

  // Business-rule violation (e.g. GeneralPlatformDomainRuleException): errors[] is empty,
  // so the top-level defaultUserMessage IS the real, specific message and must be shown.
  const domainRule = extractFineractError({
    detail: {
      defaultUserMessage: 'Debit and credit account cannot be the same GL account.',
      errors: [],
    },
  });
  a.strictEqual(domainRule, 'Debit and credit account cannot be the same GL account.');

  // Duplicate messages across errors[] entries (e.g. repeated per locale/dateFormat
  // companion param) should collapse to one line, not repeat.
  const deduped = extractFineractError({
    detail: {
      defaultUserMessage: 'Validation errors exist.',
      errors: [
        { defaultUserMessage: 'locale is required' },
        { defaultUserMessage: 'locale is required' },
      ],
    },
  });
  a.strictEqual(deduped, 'locale is required');

  // No detail object at all (network/timeout error) — falls back to e.message.
  a.strictEqual(extractFineractError({ message: 'Request timed out' }), 'Request timed out');

  // Totally empty input.
  a.strictEqual(extractFineractError(null), 'Unknown error');
  a.strictEqual(extractFineractError(undefined), 'Unknown error');

  // Sweep every JS source file to make sure the generic, detail-dropping inline pattern
  // (`X.detail?.defaultUserMessage || X.message`) hasn't crept back in anywhere.
  const fs = await import('fs');
  const path = await import('path');
  const root = path.resolve(process.cwd(), 'js');
  const offenders = [];
  const pattern = /[A-Za-z_][A-Za-z0-9_]*\.detail\?\.defaultUserMessage\s*\|\|\s*[A-Za-z_][A-Za-z0-9_]*\.message/;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.js') && pattern.test(fs.readFileSync(p, 'utf8'))) offenders.push(p);
    }
  };
  walk(root);
  a.deepStrictEqual(offenders, [], `found regressed generic-error pattern in: ${offenders.join(', ')}`);
}
