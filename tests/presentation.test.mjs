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
    doc => doc.presentation.layout[0].id = 'missing',
    doc => doc.presentation.layout[0].x = Infinity,
    doc => doc.presentation.layout[0].x = doc.presentation.layout[1].x,
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
  assert.deepEqual(geometry(html).slice(1), geometry(presentationMarkup(doc, 'success', 9, null)).slice(1));
});


test('deadline observation does not draw a provider response arrow or moving packet', () => {
  const html = presentationMarkup(checkout, 'timeout', 5, null);
  assert.match(html, /No response observed/);
  assert.match(html, /data-event-id="deadline" data-from="provider" data-to="payments-api"/);
  assert.doesNotMatch(html, /marker-end=|animateMotion|present-packet/);
});


test('persistent layout keeps every node and flow channel across scenarios and replay positions', () => {
  const geometry = html => [...html.matchAll(/class="present-node[^>]*transform="([^"]+)" data-select="([^"]+)"/g)].map(match => [match[2], match[1]]);
  const wires = html => [...html.matchAll(/data-channel="([^"]+)"[^>]*d="([^"]+)"/g)].map(match => [match[1], match[2]]);
  const baseline = presentationMarkup(checkout, 'success', 0, null);
  for (const [id, scenario] of Object.entries(checkout.scenarios)) {
    for (let step = 0; step <= scenario.events.length; step++) {
      const html = presentationMarkup(checkout, id, step, null);
      assert.equal(geometry(html).length, 6);
      assert.deepEqual(geometry(html), geometry(baseline));
      assert.deepEqual(wires(html), wires(baseline));
      assert.equal(wires(html).length, 5);
    }
  }
});
