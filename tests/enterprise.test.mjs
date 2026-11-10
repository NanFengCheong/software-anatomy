import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render } from 'pele';
import { enterprise } from '../examples/enterprise.mjs';
import { checkout } from '../examples/checkout.mjs';
import { snapshot, validateDocument } from '../toolkit/model.mjs';
import { createMermaid } from '../toolkit/pele.mjs';
import { planPanels, stateForPanel } from '../toolkit/panels.mjs';

test('enterprise fixture has explicit disjoint boundaries and valid canonical FKs', () => {
  validateDocument(enterprise);
  assert.ok(enterprise.components.length >= 12);
  assert.ok(enterprise.tables.length >= 6);
  const members = enterprise.boundaries.flatMap(boundary => boundary.members);
  assert.equal(new Set(members).size, enterprise.components.length);
  assert.equal(members.length, enterprise.components.length);
  for (const [scenarioId, scenario] of Object.entries(enterprise.scenarios)) {
    for (let step = 0; step <= scenario.events.length; step++) {
      const state = snapshot(enterprise, scenarioId, step);
      for (const rel of enterprise.relations) {
        const value = state.records[rel.from][rel.field];
        if (value !== undefined) assert.equal(value, state.records[rel.to][rel.targetField], `${scenarioId}/${step}: ${rel.from}.${rel.field}`);
      }
    }
  }
});

test('enterprise success completes only after capture, accounting and fulfillment', () => {
  const scenario = enterprise.scenarios.success;
  const final = snapshot(enterprise, 'success', scenario.events.length).records;
  assert.equal(final.orders.status, 'fulfilled');
  assert.equal(final.workflows.status, 'completed');
  assert.equal(final.payment_attempts.capture_status, 'captured');
  assert.equal(final.ledger_entries.status, 'posted');
  assert.equal(final.reservations.status, 'committed');
  assert.equal(final.shipments.status, 'dispatched');
  for (let step = 0; step <= scenario.events.length; step++) {
    const records = snapshot(enterprise, 'success', step).records;
    if (records.orders.status === 'fulfilled') {
      assert.equal(records.payment_attempts.capture_status, 'captured');
      assert.equal(records.ledger_entries.status, 'posted');
      assert.equal(records.shipments.status, 'dispatched');
    }
  }
});

test('timeout reconciliation looks up the same capture rather than charging again', () => {
  const scenario = enterprise.scenarios.timeout;
  const unknownStep = scenario.events.findIndex(event => event.id === 'capture-timeout') + 1;
  const unknown = snapshot(enterprise, 'timeout', unknownStep).records;
  assert.equal(unknown.payment_attempts.capture_status, 'unknown');
  assert.equal(unknown.orders.status, 'payment_pending');
  assert.equal(unknown.reservations.status, 'held');
  assert.equal(scenario.events.filter(event => event.id === 'capture-request').length, 1);
  assert.equal(scenario.events.filter(event => event.id === 'provider-lookup').length, 1);
  const final = snapshot(enterprise, 'timeout', scenario.events.length).records;
  assert.equal(final.payment_attempts.provider_key, unknown.payment_attempts.provider_key);
  assert.equal(final.payment_attempts.capture_status, 'captured');
  assert.equal(final.orders.status, 'fulfilled');
  assert.deepEqual(final.inbox_events, {}, 'A read-only lookup must not invent a webhook');
});

test('compensation preserves captured funds and unknown refund for manual review', () => {
  const final = snapshot(enterprise, 'compensation', enterprise.scenarios.compensation.events.length).records;
  assert.equal(final.payment_attempts.capture_status, 'captured');
  assert.equal(final.payment_attempts.refund_status, 'unknown');
  assert.equal(final.orders.status, 'manual_review');
  assert.equal(final.manual_cases.status, 'open');
  assert.equal(final.reservations.status, 'quarantined');
  assert.equal(final.ledger_entries.status, 'posted');
  assert.equal(final.shipments.status, 'rejected');
});

test('sequence phase panels partition canonical event order exactly once', () => {
  for (const [scenarioId, scenario] of Object.entries(enterprise.scenarios)) {
    const panels = planPanels(enterprise, scenarioId, 'sequence');
    assert.deepEqual(panels.flatMap(panel => panel.eventIds), scenario.events.map(event => event.id));
    assert.deepEqual(panels.flatMap(panel => panel.eventSteps), scenario.events.map((_, index) => index + 1));
    for (const panel of panels) {
      assert.ok(panel.document.components.length < enterprise.components.length);
      for (const link of panel.continuations) assert.equal(scenario.events[link.globalStep - 1].id, link.eventId);
    }
  }
});

test('architecture crossing events and ERD relationships retain explicit continuations', () => {
  for (const scenarioId of Object.keys(enterprise.scenarios)) {
    const panels = planPanels(enterprise, scenarioId, 'architecture');
    const represented = new Set(panels.flatMap(panel => [...panel.eventIds, ...panel.continuations.map(link => link.eventId)]));
    assert.deepEqual(represented, new Set(enterprise.scenarios[scenarioId].events.map(event => event.id)));
    const erd = planPanels(enterprise, scenarioId, 'erd');
    const relations = new Set(erd.flatMap(panel => [...panel.relationIds, ...panel.continuations.map(link => link.relationId)]));
    assert.deepEqual(relations, new Set(enterprise.relations.map(rel => `${rel.from}.${rel.field}->${rel.to}.${rel.targetField}`)));
    for (const panel of erd) {
      for (const rel of panel.document.relations) {
        assert.ok(panel.document.tables.some(table => table.id === rel.from));
        assert.ok(panel.document.tables.some(table => table.id === rel.to));
      }
    }
  }
});

test('panel projection reads canonical earlier writes and never replays only the slice', () => {
  const panel = planPanels(enterprise, 'success', 'sequence').find(panel => panel.id === 'fulfillment');
  const firstStep = panel.eventSteps[0];
  const state = stateForPanel(enterprise, 'success', firstStep, panel);
  assert.equal(state.globalStep, firstStep);
  assert.equal(state.step, 1);
  assert.equal(state.records.orders.status, 'paid');
  assert.equal(state.records.reservations.status, 'held');
  const outside = stateForPanel(enterprise, 'success', 1, panel);
  assert.equal(outside.event, null);
  assert.equal(outside.currentLocalStep, null);
  assert.deepEqual(outside.records.orders, {});
});

test('every authored enterprise panel renders through the existing Mermaid adapter', () => {
  for (const scenarioId of Object.keys(enterprise.scenarios)) {
    const step = enterprise.scenarios[scenarioId].events.length;
    for (const view of ['architecture', 'sequence', 'erd']) {
      for (const panel of planPanels(enterprise, scenarioId, view)) {
        validateDocument(panel.document);
        const source = createMermaid(panel.document, scenarioId, view, stateForPanel(enterprise, scenarioId, step, panel)).source;
        const output = render(source, { links: false, images: false });
        assert.ok(output.width > 0 && output.height > 0, `${scenarioId}/${view}/${panel.id}`);
      }
    }
  }
});

test('bad authored ownership/phase definitions fail; simple documents need no panels', () => {
  assert.deepEqual(planPanels(checkout, 'success', 'sequence'), []);
  for (const corrupt of [
    doc => doc.panels.architecture[0].components.push('missing'),
    doc => doc.panels.architecture[1].components.push('portal'),
    doc => doc.panels.erd[0].tables.pop(),
    doc => { doc.panels.sequence[0].phase = 'missing'; },
    doc => { doc.panels.sequence[1].id = 'intake'; },
    doc => { doc.scenarios.success.events[1].phase = 'resolution'; }
  ]) {
    const doc = structuredClone(enterprise); corrupt(doc);
    const view = doc.panels.architecture[0].components.includes('missing') || doc.panels.architecture[1].components.includes('portal') ? 'architecture' : doc.panels.erd[0].tables.length !== 4 ? 'erd' : 'sequence';
    assert.throws(() => planPanels(doc, 'success', view), TypeError);
  }
});
