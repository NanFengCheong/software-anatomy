import test from 'node:test';
import assert from 'node:assert/strict';
import { checkout } from '../examples/checkout.mjs';
import { validateDocument } from '../toolkit/model.mjs';
import { presentationMarkup } from '../toolkit/presentation.mjs';

test('presentation follows canonical timeout state and backward seeks remove later writes', () => {
  const end = presentationMarkup(checkout, 'timeout', 8, null).replaceAll('<wbr>', '');
  assert.match(end, /data-present-record="payment_attempts">unknown/);
  assert.match(end, /data-present-record="reservations">held/);
  assert.match(end, /data-present-record="orders">payment_pending/);
  assert.match(end, /before any lookup result/);
  const before = presentationMarkup(checkout, 'timeout', 2, null);
  assert.doesNotMatch(before, /data-present-record="payment_attempts"/);
  assert.match(before, /data-present-record="orders">pending/);
  assert.doesNotMatch(before, /data-present-record="payment_attempts">unknown/);
});

test('presentation rejects scene identity drift, invalid symbols and unsafe duration', () => {
  for (const mutate of [
    doc => doc.scenarios.timeout.presentation.scenes.reverse(),
    doc => doc.presentation.symbols.browser = '<svg>',
    doc => doc.presentation.overview[0] = 'missing',
    doc => delete doc.presentation.symbols.browser,
    doc => doc.scenarios.success.presentation.scenes[0].evidence = ['missing'],
    doc => doc.scenarios.success.presentation.scenes[0].duration = 0,
    doc => doc.scenarios.success.presentation.scenes[0].caption = ''
  ]) {
    const doc = structuredClone(checkout); mutate(doc);
    assert.throws(() => validateDocument(doc), /presentation/i);
  }
});

test('presentation escapes authored text and preserves current message endpoints', () => {
  const doc = structuredClone(checkout);
  doc.scenarios.success.presentation.scenes[3].caption = '<img src=x onerror=alert(1)>';
  const html = presentationMarkup(validateDocument(doc), 'success', 4, null);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.match(html, /data-event-id="capture" data-from="payments-api" data-to="provider"/);
  const geometry = markup => [...markup.matchAll(/transform="translate\([^)]+\)"/g)].map(match => match[0]);
  assert.deepEqual(geometry(html), geometry(presentationMarkup(doc, 'success', 4, null)));
});


test('deadline observation does not draw a provider response arrow or moving packet', () => {
  const html = presentationMarkup(checkout, 'timeout', 5, null);
  assert.match(html, /No response observed/);
  assert.match(html, /data-event-id="deadline" data-from="provider" data-to="payments-api"/);
  assert.doesNotMatch(html, /marker-end=|animateMotion|present-packet/);
});
