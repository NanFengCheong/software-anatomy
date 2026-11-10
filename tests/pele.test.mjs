import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, render } from 'pele';
import { checkout } from '../examples/checkout.mjs';
import { snapshot, validateDocument } from '../toolkit/model.mjs';
import { createMermaid } from '../toolkit/pele.mjs';

test('every scenario step renders architecture, sequence and ERD through Pele', () => {
  for (const [scenarioId, scenario] of Object.entries(checkout.scenarios)) {
    for (let step = 0; step <= scenario.events.length; step++) {
      for (const [view, type] of [['architecture', 'architecture'], ['sequence', 'sequence'], ['erd', 'er']]) {
        const diagram = createMermaid(checkout, scenarioId, view, snapshot(checkout, scenarioId, step));
        const result = render(diagram.source, { links: false, images: false });
        assert.equal(result.type, type);
        assert.ok(result.width > 0 && result.height > 0);
        const ids = new Set([...result.svg.matchAll(/class="pele-node[^\"]*" data-id="([^\"]+)"/g)].map(match => match[1]));
        assert.deepEqual(ids, new Set(diagram.nodes.keys()));
        if (view === 'sequence') {
          const messages = [...result.svg.matchAll(/class="pele-edge pele-message" data-id="([^\"]+)"/g)].map(match => match[1]);
          assert.deepEqual(messages, [...diagram.messages.keys()]);
          assert.deepEqual([...diagram.messages.values()].map(entry => entry.event.id), scenario.events.map(event => event.id));
        }
      }
    }
  }
});

test('aliases map duplicate display names to distinct stable IDs', () => {
  const doc = structuredClone(checkout);
  doc.components.forEach(item => { item.name = 'Service'; });
  for (const view of ['architecture', 'sequence']) {
    const diagram = createMermaid(doc, 'success', view, snapshot(doc, 'success', 0));
    assert.equal(new Set(diagram.nodes.values()).size, doc.components.length);
    assert.equal([...diagram.nodes.values()][3], 'payments-api');
  }
});

test('author text cannot inject Mermaid nodes, messages, links or markup', () => {
  const doc = structuredClone(checkout);
  const hostile = '"]\nservice evil(server)[Bad]\nparticipant evil\nc0->>c1: Injected\n<script>alert(1)</script><img src="https://bad.invalid" onerror="alert(1)">';
  doc.components[0].name = hostile;
  doc.tables[0].name = hostile;
  doc.boundaries[0].name = hostile;
  doc.scenarios.success.events[0].label = hostile;
  doc.scenarios.success.events[0].writes.orders.status = hostile;
  validateDocument(doc);
  for (const view of ['architecture', 'sequence', 'erd']) {
    const diagram = createMermaid(doc, 'success', view, snapshot(doc, 'success', 1));
    assert.ok(!diagram.source.includes('<script>'));
    const model = parse(diagram.source);
    if (view === 'architecture') assert.equal(model.nodes.size, doc.components.length);
    if (view === 'sequence') { assert.equal(model.actors.size, doc.components.length); assert.equal(model.messages.length, 9); }
    if (view === 'erd') { assert.equal(model.entities.size, doc.tables.length); assert.equal(model.relationships.length, 3); }
    const { svg } = render(diagram.source, { links: false, images: false });
    assert.ok(!/<(?:script|image|foreignObject|a)\b/i.test(svg));
    assert.ok(!svg.includes('data-id="evil"'));
  }
});

test('ERD preserves FK direction, optional child count and independent child identity', () => {
  const diagram = createMermaid(checkout, 'success', 'erd', snapshot(checkout, 'success', 9));
  const model = parse(diagram.source);
  assert.equal(model.relationships.length, 3);
  for (const relationship of model.relationships) {
    assert.equal(relationship.relSpec.cardA, 'ZERO_OR_MORE');
    assert.equal(relationship.relSpec.cardB, 'ONLY_ONE');
    assert.equal(relationship.relSpec.relType, 'NON_IDENTIFYING');
  }
  assert.ok(diagram.source.includes('string status "confirmed"'));
  assert.ok(diagram.source.includes('string status "captured"'));
  assert.ok(diagram.source.includes('string order_id FK "ord_1042"'));
});
