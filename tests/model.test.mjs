import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkout } from '../examples/checkout.mjs';
import { validateDocument, snapshot, relatedIds, recordSummary } from '../toolkit/model.mjs';
import { buildHtml } from '../scripts/build.mjs';
import { escapeHtml } from '../toolkit/render.mjs';

test('success confirms only after capture and commits held inventory', () => {
  validateDocument(checkout);
  const events = checkout.scenarios.success.events;
  for (let step = 0; step <= events.length; step++) {
    const { records } = snapshot(checkout, 'success', step);
    if (records.orders.status === 'confirmed') {
      assert.equal(records.payment_attempts.status, 'captured');
      assert.equal(records.reservations.status, 'committed');
      assert.equal(records.webhook_events.status, 'processed');
    }
    if (step < 6) assert.notEqual(records.payment_attempts.status, 'captured');
  }
  const { records } = snapshot(checkout, 'success', events.length);
  assert.equal(records.orders.status, 'confirmed');
  assert.equal(records.payment_attempts.order_id, records.orders.id);
  assert.equal(records.reservations.order_id, records.orders.id);
  assert.equal(records.webhook_events.attempt_id, records.payment_attempts.id);
});

test('timeout preserves unknown payment outcome, pending order and inventory hold', () => {
  const events = checkout.scenarios.timeout.events;
  const { records } = snapshot(checkout, 'timeout', events.length);
  assert.equal(records.payment_attempts.status, 'unknown');
  assert.equal(records.payment_attempts.provider_ref, null);
  assert.equal(records.orders.status, 'payment_pending');
  assert.equal(records.reservations.status, 'held');
  assert.deepEqual(records.webhook_events, {});
  assert.ok(events.some(event => event.to === 'reconciler'));
  assert.equal(events.filter(event => event.to === 'provider').length, 1);
});

test('backward seek and scenario switching never retain future records', () => {
  const final = snapshot(checkout, 'success', 9);
  final.records.orders.status = 'tampered';
  const earlier = snapshot(checkout, 'success', 3);
  assert.equal(earlier.records.payment_attempts.status, 'initiated');
  assert.deepEqual(earlier.records.webhook_events, {});
  assert.equal(snapshot(checkout, 'success', 9).records.orders.status, 'confirmed');
  assert.equal(snapshot(checkout, 'timeout', 8).records.payment_attempts.status, 'unknown');
  for (const row of Object.values(snapshot(checkout, 'success', 0).records)) assert.deepEqual(row, {});
});

test('table ownership supplies stable cross-view focus', () => {
  assert.deepEqual(relatedIds(checkout, 'payment_attempts'), new Set(['payments-api', 'payment_attempts', 'webhook_events']));
  assert.deepEqual(relatedIds(checkout, 'payments-api'), relatedIds(checkout, 'payment_attempts'));
});

test('record summaries preserve independent statuses and distinguish created rows', () => {
  assert.equal(recordSummary({}), 'not created');
  assert.equal(recordSummary({ id: 'row-1' }), 'created');
  assert.equal(recordSummary({ status: 'held' }), 'held');
  assert.equal(recordSummary({ capture_status: 'captured', refund_status: 'unknown' }), 'capture: captured · refund: unknown');
  assert.equal(recordSummary({ status: 'refund_unknown', capture_status: 'captured', refund_status: 'unknown' }), 'capture: captured · refund: unknown');
});

test('invalid references, clocks, writes, identifiers and seek bounds fail loudly', () => {
  const corruptions = [
    doc => { doc.components[1].id = 'browser'; },
    doc => { doc.tables[0].owner = 'missing'; },
    doc => { doc.scenarios.success.events[0].to = 'missing'; },
    doc => { doc.scenarios.success.events[0].writes.orders.missing = true; },
    doc => { doc.scenarios.success.events[1].at = -1; },
    doc => { doc.scenarios.success.events[1].id = 'submit'; },
    doc => { doc.relations[0].field = 'missing'; },
    doc => { doc.tables[0].fields.push('__proto__'); },
    doc => { doc.tables[0].fields.push('constructor'); },
    doc => { doc.scenarios.success.events[0].writes.orders.status = {}; }
  ];
  for (const corrupt of corruptions) { const doc = structuredClone(checkout); corrupt(doc); assert.throws(() => validateDocument(doc), TypeError); }
  for (const step of [-1, 10, 1.5, NaN]) assert.throws(() => snapshot(checkout, 'success', step), RangeError);
  assert.throws(() => snapshot(checkout, 'constructor', 0), RangeError);
});

test('offline bundle escapes hostile document text and has no remote assets or imports', async () => {
  const doc = structuredClone(checkout);
  doc.title = '</script><img src=x onerror=alert(1)>';
  doc.components[0].description = '<svg onload="alert(1)">';
  const html = await buildHtml(doc);
  assert.equal((html.match(/<script\b/g) ?? []).length, 1);
  assert.equal((html.match(/<\/script>/g) ?? []).length, 1);
  assert.ok(html.includes('\\u003c/script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!/^(import|export) /m.test(html));
  assert.ok(!/@import\s|<script[^>]+src=|<link[^>]+href=|url\(\s*['"]?https?:/i.test(html));
  assert.ok(html.includes('Pele 1.13.0'));
  assert.equal(escapeHtml('<svg onload="x">&'), '&lt;svg onload=&quot;x&quot;&gt;&amp;');
});
