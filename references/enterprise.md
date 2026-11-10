# Enterprise example and authored panels

`examples/enterprise.mjs` models one illustrative tenant order across 16 components,
11 representative record types and four disjoint trust/business boundaries. The
scenarios cover successful fulfillment, a timed-out capture resolved by a read-only
provider lookup, and warehouse rejection followed by an unknown refund outcome
retained for manual review.

This is teaching data: no real identity provider, queue, warehouse, gateway,
database or signature implementation is exercised. It is not multi-row accounting,
production transaction isolation or tenant-security proof. Captured payment and
refund outcome remain separate. An unresolved refund never becomes a fictitious
rollback; stock custody and operations case stay explicit.

## Canonical model and views

`planPanels(doc, scenarioId, view)` in `toolkit/panels.mjs` returns authored panels:

```js
{
  id, name, description, view,
  document,        // valid subset document; same component/table/event IDs
  eventSteps,      // local message index -> canonical 1-based event position
  eventIds,
  primaryIds,      // authored ownership; contextIds are explicitly supplementary
  contextIds,
  relationIds,
  continuations   // cross-panel event/phase/FK links with stable IDs
}
```

Documents without panel metadata return `[]`. The full-system view is still valid;
authored panels provide deliberate readable alternatives, not automatic generic
graph splitting. A detailed panel can still exceed a fixed output box: retain the
font floor and report needs-panels rather than claiming every enterprise graph fits.

`doc.panels.architecture` assigns every component to exactly one primary subsystem.
Boundary events remain visible as continuations on both involved panels. A panel
may also include context owners needed by its records; do not imply those context
services have moved to another owning subsystem.

`doc.panels.sequence` names ordered `phase` values. Events carry that phase ID.
Nonempty panels must partition all scenario events exactly once in canonical
order. Absent phases, such as reconciliation on a successful payment, are omitted.
Between-phase continuations point to the next canonical event. Local message iN
clicks must seek `panel.eventSteps[N]`, not the local message number.

`doc.panels.erd` assigns every table to exactly one primary data panel. Referenced
parents are included transitively as context, so FKs never silently dangle. Every
cross-panel FK is also a labelled continuation with child/field/parent/targetField.
All canonical relations remain represented or explicitly linked.

## State projection

Always call `snapshot` against the original document. `stateForPanel(doc,
scenarioId, globalStep, panel)` reads canonical history, then projects visible
records. Replaying only a panel would lose earlier writes and fabricate empty
payment/order state. It returns local `step`, canonical `globalStep`, `event` and
`currentLocalStep`. When global playback is elsewhere, event/currentLocalStep are
null; visited messages may remain visible, but do not highlight a previous local
message as current. Root controls retain canonical scenario/step and inspector.

The panel planner rejects duplicate/missing ownership, unknown members and phases
that lose, repeat or reorder events. These are authoring errors, not permission
gates. Continuation rows belong in exports as well as the interactive view.
