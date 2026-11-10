# Pele integration — 10 November 2026

Sources: [API](https://pele.run/api), [compatibility](https://pele.run/compatibility),
[security](https://pele.run/security). Pele **1.13.0** is pinned in package.json
and package-lock.json. The package was inspected and exercised; published speed
and size comparisons were not benchmarked.

Pele renders Mermaid-compatible text or its parsed model to SVG, supports CSS
variable themes, and provides responsive mounting and zoom. Its compatibility
documentation lists architecture, C4, ERD, sequence, flowchart and swimlane types.
Layout differs from Mermaid and JavaScript click callbacks are ignored.

`toolkit/pele.mjs` generates Mermaid and calls Pele render for all three views.
The event stream, snapshots and selection controller remain in the domain model.
Native module consumers use the npm import; the HTML builder embeds Pele's browser
bundle and full MIT/ISC notices, then binds the adapter to `pele.render`.
Keep those notices in every distribution. Exports make no application HTTP calls.

`toolkit/output.mjs` sets destination dimensions and font-size constraints before
Pele rendering. The adapter consumes that result instead of relying on browser
fit-to-width. See `references/output.md` for fixed targets and failure behavior.

Mappings are explicit and version-specific:

- Architecture: architecture-beta uses cN aliases, boundary memberships and port
  directions. Nodes expose data-id. Structural bidirectional edges remain
  bidirectional during replay; the event inspector gives current direction.
- Sequence: sequenceDiagram has one event per message. Message iN IDs map to exact
  event IDs and replay steps. Line and label share one keyboard target; duplicate
  footer participants remain decorative.
- ERD: erDiagram uses tN aliases, mandatory many-to-one FKs and current record
  values as attribute comments. Independent child PKs use non-identifying edges.

Runtime hooks (.pele-node, .pele-service, .pele-message, .pele-edge-label,
.pele-er-comment, data-id) are package-version contracts. Adapter failures stop
playback and show text-only errors; do not silently substitute another renderer.
Rerun every-step adapter tests and browser journeys when upgrading Pele.

Only generated aliases become Mermaid identifiers. Display text encodes syntax
delimiters as numeric entities. Render options belong to the application: links
and images disabled, no custom icon/math markup, source/output limits retained.
Errors use textContent. Embedded JSON and closing script delimiters are escaped.
Opening exported HTML restarts at event zero with the complete Pele runtime.

Mermaid is a rendering projection; arbitrary Mermaid alone cannot define business
events, record writes or ownership. Playback remains illustrative, not a latency
benchmark.
