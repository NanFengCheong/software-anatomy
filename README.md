# Software Anatomy

Explain a real software process through connected **architecture, sequence and
entity-relationship diagrams**. One replayable model drives every view, caption
and record snapshot.

**[Explore the demo](https://nanfengcheong.github.io/software-anatomy/)** ·
[Checkout](https://nanfengcheong.github.io/software-anatomy/checkout.html) ·
[Enterprise orchestration](https://nanfengcheong.github.io/software-anatomy/enterprise.html) ·
[Readable output](https://nanfengcheong.github.io/software-anatomy/output-targets.html)

## What it does

- Follow a request across services, messages and persisted records. Selection
  stays connected when switching views.
- Play, pause, step and scrub success, timeout and compensation scenarios.
- Choose **Neutral / Ocean / Forest** and **Auto / Light / Dark** independently.
  Neutral is the default; Auto follows the OS. Both choices persist.
- Export offline HTML, SVG, 2× PNG and GIF walkthroughs with resolved theme,
  fixed animation geometry, captions and record summaries.
- Render for the destination's usable width and height. Reflow precedes scaling;
  static layouts that cannot preserve readable text report **needs panels**.
- Use authored enterprise phases and subsystem/data panels with explicit
  cross-panel calls, foreign keys and canonical event identities.

Pele renders generated Mermaid syntax; Software Anatomy supplies the domain model,
replay, connected inspection, output sizing and media composition.

## Run locally

Requires Node.js 20+.

```sh
git clone https://github.com/NanFengCheong/software-anatomy.git
cd software-anatomy
npm ci
npm test
npm run build
npm run dev
```

Open [localhost:4173](http://127.0.0.1:4173). Built demos in `dist/` also open
directly without a server, CDN, external fonts or service credentials.

The public demo uses static GitHub Pages hosting. Replay and encoding run in your
browser; the demo does not send your model to a hosted application backend.

## Use with an agent

Install the portable skill:

```sh
npx skills add NanFengCheong/software-anatomy
```

The root [SKILL.md](SKILL.md) is the entry point. Alternatively, link this checkout
into your agent's skill directory as `software-anatomy`; keep its toolkit,
examples and references together.

Agents with terminal access can validate JSON models, generate Mermaid source and
build offline HTML through the CLI. MCP clients can start the local stdio server:

```sh
node scripts/mcp-server.mjs
```

No API key or hosted MCP service is required. **GitHub Pages is not an MCP
endpoint**; the server runs locally. See [agent integration](references/agent-integration.md)
for CLI examples, tool contracts and Codex, Claude Desktop and Cursor configuration.
The site's [agent-tools.json](https://nanfengcheong.github.io/software-anatomy/agent-tools.json)
advertises the integration in a machine-readable form.

## Model and examples

Start with [checkout.mjs](examples/checkout.mjs), then read the
[model contract](references/model.md). Stable IDs connect components and entities;
events define sender, receiver, illustrative time and explicit record writes.
Seeking backwards replays into fresh snapshots.

The [enterprise example](examples/enterprise.mjs) spans **16 components and 11
representative record types**. Three scenarios cover fulfillment, capture
reconciliation and an unresolved refund retained for manual review. Authored
panels preserve global event order and labelled continuations.

| Area | Contract |
| --- | --- |
| Ownership and replay | [Model](references/model.md) |
| Width, height and font floors | [Output targets](references/output.md) |
| Panels and crossing identities | [Enterprise](references/enterprise.md) |
| PNG/GIF validation, budgets and cancellation | [Media](references/media-encoding.md) |
| Pinned SVG adapter hooks | [Pele integration](references/pele.md) |

Default label floors are 14 CSS px for documents/interactive views and 20 CSS px
for slides. Raster density improves sharpness; placement width determines readable
text size. Animation pacing is separate from authored trace timestamps.

## Verify

```sh
npm test
npm run build
npm run test:browser
```

The browser suite requires Chromium and `ffprobe` from FFmpeg. Set `CHROME_PATH`
when Chromium is outside a standard installation location. Tests use an isolated
temporary profile and write ignored local evidence to `output/`. Browser export
itself needs no FFmpeg installation. Verification covers replay, validation,
themes, media decoding, offline exports and enterprise panel identities.

## Scope

Bundled business events, records and timings are **simulated**. No live gateway,
queue, warehouse, identity provider, database or signature implementation is proved.
The model represents one example row per entity and mandatory many-to-one FKs.
Panels are authored; automatic graph partitioning, a raw-Mermaid editor,
multi-row simulation, pan/zoom and video encoding are outside the implementation.
A panel can still need decomposition for a small destination.

## Credits and license

Inspired by [Anatomy](https://github.com/wheresryan22/anatomy), adapted toward
software behavior and standard notation. Rendering uses
[Pele](https://github.com/obsidianmd/pele); GIF encoding uses
[gifenc](https://github.com/mattdesl/gifenc).

Software Anatomy is [MIT licensed](LICENSE). Dependency notices are preserved in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and bundled offline HTML.
