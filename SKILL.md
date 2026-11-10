---
name: software-anatomy
description: Create interactive software walkthroughs with connected architecture, sequence and entity relationship views, deterministic scenario playback and inspectable record state. Use for explaining real software behavior from requirements, code, schemas or API contracts.
---

# Software Anatomy

Create software explanations whose interactions reveal real relationships and state.
This folder is both a skill and a Pele-based Mermaid rendering toolkit.

## Start from evidence

Identify the system, audience, source contracts and business scenario. Separate
observed behavior from assumptions. Use stable IDs for components and entities;
table ownership connects focus across views. Do not match entities by display text.

Use `examples/checkout.mjs` as the runnable document contract. Read
`references/model.md` when authoring another example. Describe components, tables,
FK relationships and scenarios. Each event names sender, receiver, simulated time,
human explanation and explicit record writes. Replay state from the beginning when
seeking; never mutate future state backwards by guessing inverse operations.

Preserve real business semantics. Transport timeout is an unknown payment outcome,
not proof of rejection. State where an example ends and which later resolution is
unproved. Annotate simulations; do not invent measurements, provider evidence or
transaction guarantees. Keep credentials and real personal data out of examples.

## Render

The authoring entry point is `toolkit/render.mjs`: call
`mountAnatomy(element, document)` and include `toolkit/styles.css`. The returned
function cleans up listeners and playback. `toolkit/pele.mjs` generates Mermaid
architecture, sequence and ERD source, renders through Pele and maps SVG data IDs
back to model IDs. Read `references/pele.md` before changing that adapter.
The renderer supports one representative record per entity; it is not a database
engine or infrastructure discovery tool. Arbitrary Mermaid input alone cannot
provide the ownership, events and record writes needed for connected playback.

Auto/Light/Dark uses `toolkit/theme.mjs`: Auto follows OS changes; explicit modes
persist and exported HTML retains its preference. Media captures the resolved
palette in opaque, self-contained SVG, including captions, warnings and records.

Run `npm ci` to install pinned Pele. For a standalone example, use
`buildHtml(document)` from `scripts/build.mjs`; it embeds Pele, its license, the
model and application runtime into one HTML file. No CDN or HTTP request is needed
when opening or exporting the walkthrough.
`npm run build` writes the checkout demo to `dist/checkout.html`.
`npm run dev` serves it at `http://127.0.0.1:4173`.

Reuse the existing model, renderer and CSS variables. Prefer legible 2D software
notation, explicit directions, visible FK cardinality and component boundaries.
Motion represents current events; record readouts come from that same event stream.
Keep playback user initiated, support keyboard activation and reduced motion, and
contain wide diagrams in a scrollable viewport on phones.

## Lay out for the destination

Establish final usable content width before rendering: document column, slide
content rectangle, image placement or animation viewport. Include height for
fixed canvases. Use CSS pixels at placement size; raster density increases
sharpness, not readable physical text size.

Use `renderForTarget(source, options)` from `toolkit/output.mjs`. Defaults:
document 650px / minimum 14px labels; slide 1120×560px / minimum 20px; interactive
container width / minimum 14px. Supply the actual destination box. Reflow and wrap
before scaling. Interactive views can scroll; static outputs throw OutputFitError
when they need panels. Read `references/output.md` for the API and split guidance.
A vector export alone does not solve illegible layout.

Verify text after placement at 100% viewing size, including edge labels and ERD
keys. Preserve branches, relations and feedback loops. Split deliberately with
labelled continuations when detail cannot fit. For animated exports, maintain the
same canvas, font floor and layout across frames; layout changes distract from
state changes.

## Static and animated media

Use Export image / GIF for SVG or 2× PNG in diagram/explanation-card compositions,
or a scenario GIF. Width is final CSS placement width. Slides have a 560px height
budget. Fit failures require smaller authored panels or another destination;
never lower the font floor simply to make encoding succeed.

`createMediaFrames` in `toolkit/exports.mjs` plans one geometry for the complete
range. ERD columns reserve measured widths before text changes; transforms stay
fixed. Frames include global step, authored caption, current record summaries,
simulation label and explicit continuations. Presentation delays are separate
from trace timestamps; the final frame holds 2.2 seconds. Read
`references/media-encoding.md` for validation, cancellation and budgets. Encoders
run locally in the exported HTML.

## Enterprise views

Use subsystem, phase and data-panel ownership for large models. Read
`references/enterprise.md` before adding panels; `examples/enterprise.mjs` covers
16 components, 11 record types, reconciliation and unresolved compensation.
Keep canonical snapshots as replay truth; map local messages to global eventSteps.
Every crossing call/FK needs source/target panel endpoints and stable identity in
interactive and static outputs. Full-system view remains available; Follow current
phase selects a bounded view. Panels are authored, not automatic graph partitioning.
More panels do not prove throughput, tenant isolation or production transactions.

## Verify

Run `npm test` and `npm run build`. Verify the real browser boundary: both outcomes,
backward seek, reset, selection across views, tab keyboard navigation and export
opened offline. Inspect desktop and phone screenshots. Model tests alone do not
prove browser behavior. Preserve exact limitations in the task record.

Pele handles diagram parsing, layout and SVG. Keep scenario state and replay in
the domain model. Pin upgrades and rerun SVG mapping and browser gates; generated
SVG class names and message IDs are an adapter contract, not a public model API.
