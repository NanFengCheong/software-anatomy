# Document contract

See `examples/checkout.mjs` for a complete executable document and
`toolkit/model.mjs` for validation and replay.

- `title`, `subtitle`, `description`: explanatory text, escaped by the renderer.
- `components`: `{ id, name, kind, icon, x, y, description }`. Pele owns layout;
  relative x/y positions select architecture edge ports (left/right or top/bottom),
  not absolute SVG positions. Kind informs the inspector and service symbols.
- `boundaries` (optional): `{ name, members }`, architecture groups. Members are
  component IDs; a component belongs to at most one group. Legacy geometry
  properties are accepted but unused by Pele.
- `tables`: `{ id, name, owner, x, y, fields, description }`. Owner references a
  component ID. Coordinates remain accepted but Pele places entities. Field
  types are inferred from scenario values; current values become attribute comments.
- `relations`: `{ from, to, field, targetField, label }`. From is the child table;
  `field` references the parent table's `targetField`. Current renderer supports
  mandatory many-to-one FKs (0..N children to 1 parent); adapt it explicitly for
  optional FKs, one-to-one or many-to-many relationships. Do not mislabel them.
  Relations are non-identifying because this example uses independent child
  primary keys. The field name labels each Mermaid relation.
- `scenarios`: ID-keyed objects `{ name, short, outcome, description, events }`.
- Each event: `{ id, at, from, to, label, detail, writes, tone? }`. `at` is
  nondecreasing milliseconds from scenario start, not measured production latency.
  `writes` maps table IDs to field/value patches. Values are scalar or null.
  `tone: 'warning'` marks uncertainty. No event can reference an unknown field.

Identifiers use lowercase ASCII letters, digits, hyphens and underscores; field
names use underscores. Prototype-sensitive names are rejected. Display labels
can contain Unicode. `snapshot(doc, scenarioId, count)` replays exactly `count`
events into fresh records. Step 0 contains no records. Each table represents one
example row, not a row collection; add a row model before teaching multi-row flows.

Pele provides automatic layout for architecture-beta, sequenceDiagram and
erDiagram. Sequence lanes follow component order. Each event produces exactly
one message, mapping Pele iN IDs to replay steps. Architecture arrows summarize
directed or bidirectional dependencies; the event inspector names the current
sender and receiver. Wide diagrams scroll within the canvas. No raw-Mermaid editor,
pan/zoom or infrastructure discovery is exposed. Source generation is available
as `createMermaid(doc, scenarioId, view, state)` from `toolkit/pele.mjs`.

Embed with a bundler that resolves the pinned `pele` npm dependency:

```js
import { mountAnatomy } from './toolkit/render.mjs';
import { checkout } from './examples/checkout.mjs';
const dispose = mountAnatomy(document.querySelector('#app'), checkout);
// Call dispose() when removing the walkthrough.
```

Include `toolkit/styles.css`. Host one mounted walkthrough per page in this version
(the control IDs and CSS are page scoped). Standalone HTML includes all scripts,
styles and document data; opening it makes no application network requests.
