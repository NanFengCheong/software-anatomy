# Output size is an input

`toolkit/output.mjs` exports `renderForTarget(source, options)`, `outputTargets`
and `OutputFitError`. It accepts Mermaid source, including `createMermaid` output.
It owns safe Pele options: images/links disabled, source/output limits retained.

```js
import { renderForTarget } from './toolkit/output.mjs';
const { svg, report } = renderForTarget(source, {
  target: 'document', width: 650, minFontSize: 14
});
```

| Target | Default usable box | Base/minimum label size | If it cannot fit |
| --- | --- | --- | --- |
| document | 650px × automatic height | 18 / 14px | Throw, report needs-panels |
| slide | 1120 × 560px | 26 / 20px | Throw, report needs-panels |
| interactive | Actual container width | 14 / 14px | Preserve size and scroll |

Interactive labels sit below the surrounding section heading in the visual
hierarchy. Pele may raise the base to preserve the 14px floor for secondary
labels; do not enlarge sparse diagrams to fill their container. Document and
slide presets use larger type for their intended viewing distance.

Supply width, optional height, fontSize and minFontSize for the real destination.
Measure content after margins and columns. Convert points using 96 CSS pixels per
72 points. A diagram rendered for 650px then embedded at 325px has half the label
size: rerender for 325px. More PNG pixels and SVG do not change that relationship.

The renderer gives Pele actual maxWidth. If final scaling violates the label
floor, it tries narrow layout even above the default 640px breakpoint. It checks
the smallest emitted font, including secondary labels, before accepting fit.
Fixed dimensions prevent a second automatic width/height clamp. The report gives
natural/display geometry, effective font floor and fits/scroll/needs-panels
disposition. Consumers must honor placement dimensions. This is a font-size gate,
not a complete typography/crossing audit; inspect final output visually.

Automatic panel splitting is not implemented. If fit fails, author views and retry:

- Process/flowchart: vertical flow or meaningful stages; retain decisions and
  feedback edges, and label every cross-panel continuation.
- Sequence: phases with repeated participant headers and explicit continuation;
  preserve message order, timeout timing and scenario identity.
- ERD: relationship overview plus entity details; keep FK endpoints/cardinality
  visible and identify omitted attributes.
- Architecture: overview plus bounded subsystem details; preserve ownership and
  labelled dependencies across panels.

Preserve sequence semantics and source logic when changing aspect ratio. For
GIF/video, plan the frame range and lock geometry and font sizes. This sizing helper
does not itself encode media. `toolkit/exports.mjs` locks a supplied scenario range;
`toolkit/media.mjs` encodes SVG/PNG/GIF. The UI captures the resolved theme in opaque
backgrounds. Captions, records and continuations wrap to usable width. Nested SVG
width/height attributes match CSS placement size, preventing caption overlap during
image decoding.

`npm run build` generates `dist/output-targets.html` and
`dist/capture-loop-document.svg`, reproducing the seven-step layout problem and a
readable 650px document version. Browser checks measure text after the actual SVG
viewBox transform; model dimensions alone are insufficient final proof.
