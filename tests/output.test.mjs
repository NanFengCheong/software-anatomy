import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderForTarget, OutputFitError } from '../toolkit/output.mjs';

const source = await readFile(new URL('../examples/capture-loop.mmd', import.meta.url), 'utf8');

test('long horizontal flow reflows for document width without losing nodes or feedback', () => {
  const result = renderForTarget(source, { target: 'document' });
  assert.equal(result.report.disposition, 'fits');
  assert.equal(result.report.reflowed, true);
  assert.ok(result.report.displayWidth <= 650);
  assert.ok(result.report.effectiveMinFontSize >= 14);
  assert.equal((result.svg.match(/class="pele-node /g) ?? []).length, 7);
  assert.equal((result.svg.match(/class="pele-edge"/g) ?? []).length, 7);
  assert.ok(result.svg.includes('data-id="L_review_profiles_0"'));
  assert.ok(result.svg.includes('max-width:none'));
});

test('fixed slide area rejects unreadable output instead of shrinking labels', () => {
  assert.throws(() => renderForTarget(source, { target: 'slide' }), error => error instanceof OutputFitError && error.report.disposition === 'needs-panels' && error.report.minFontSize === 20);
});

test('interactive view can scroll while retaining minimum label size', () => {
  const sequence = 'sequenceDiagram\nparticipant a as Very long participant one\nparticipant b as Very long participant two\na->>b: A deliberately long message that cannot fit the narrow viewport';
  const result = renderForTarget(sequence, { target: 'interactive', width: 120 });
  assert.equal(result.report.disposition, 'scroll');
  assert.ok(result.report.displayWidth > 120);
  assert.ok(result.report.effectiveMinFontSize >= 14);
});

test('invalid target dimensions and policies fail at the output boundary', () => {
  for (const options of [{ target: 'missing' }, { width: 0 }, { width: NaN }, { height: -1 }, { minFontSize: 0 }, { fontSize: Infinity }, { overflow: 'shrink' }]) assert.throws(() => renderForTarget(source, options), RangeError);
});
