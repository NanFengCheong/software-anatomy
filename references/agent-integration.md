# Agent integration

Software Anatomy supports a portable skill, a CLI and a standard MCP stdio
server. None requires a model-provider API key. GitHub Pages hosts the static demo;
it is not a remote MCP endpoint.

## Install

```sh
git clone https://github.com/NanFengCheong/software-anatomy.git
cd software-anatomy
npm ci
```

Use an absolute checkout path in client configuration. Replace `/absolute/path/to`
with your own location. GUI clients may need the full path to `node`. On Windows,
escape backslashes in JSON or use forward slashes.

For agents with portable skill support:

```sh
npx skills add NanFengCheong/software-anatomy
```

Other agents can read `SKILL.md` and use the CLI or MCP tools. This project is
distributed from GitHub; these instructions do not imply an npm-published package.

## CLI

Run from the installed checkout:

```sh
node scripts/cli.mjs examples --name checkout > checkout.json
node scripts/cli.mjs validate --input checkout.json
node scripts/cli.mjs source --input checkout.json --scenario success --view sequence
node scripts/cli.mjs render --input checkout.json --scenario success --view sequence --target document --width 650 --theme light --output checkout.svg
node scripts/cli.mjs build --input checkout.json --output checkout.html
```

`enterprise` is the other bundled example. Diagram views are `architecture`,
`sequence` and `erd`. Preserve the original model as state authority; Mermaid
alone cannot reconstruct ownership, event writes or scenario behavior. Inspect
generated HTML in a browser before treating a model as a correct explanation.

`--example checkout|enterprise` can replace `--input`. Use `--input -` to read
JSON from stdin. Build/render require an output filename and refuse to overwrite
an existing file unless `--force` is supplied. JSON models are limited to 1 MiB.

## MCP tools

Start the local server:

```sh
node /absolute/path/to/software-anatomy/scripts/mcp-server.mjs
```

It returns model/source/rendered content over stdio. It does not publish to
GitHub, call external business services or write arbitrary server-side files.
The client owns permission and artifact-saving decisions. PNG and GIF use the
browser's canvas encoder; they are not server-side MCP media tools.

| Tool | Purpose |
| --- | --- |
| `list_examples` | Discover bundled examples and scenarios. |
| `get_example` | Retrieve a complete model to inspect or adapt. |
| `validate_model` | Validate the supplied domain model. |
| `diagram_source` | Generate Mermaid for a scenario and view. |
| `render_svg` | Render a model view for a usable output box and label-size floor. |
| `build_html` | Build self-contained interactive HTML. |

Pass either `example: "checkout" | "enterprise"` or `model: <document>` to model
tools. Diagram calls accept scenario, view, step, panel, target, width and theme
(`light` or `dark`) as applicable. `render_svg` also accepts `palette`:
`neutral` (default), `ocean` or `forest`; CLI render uses `--palette`.
Use `tools/list` for each exact schema and defaults.
Render/build results return a `resource_link` to a bounded in-memory
artifact. Read that URI through MCP `resources/read`, then let the client save the
content. Restarting the server discards its artifact cache; save artifacts you need.

`render_svg` returns a diagram-only resource. Its result also carries continuation
and global event-step metadata; retain that context when composing a standalone
document. Browser explanation-card exports place those continuations in the image.

Use the final usable width for rendering. When fit needs panels, decompose with
labelled continuations; do not repeatedly reduce text size. The static site's
`agent-tools.json` describes the local integration; it is not a remote MCP endpoint.

Suggested agent instruction:

> Use Software Anatomy to explain this process. Inspect a bundled model, adapt its
> stable IDs and explicit event writes, validate it, then build offline HTML. Keep
> assumptions and simulated timings visible. Render for the final document width
> and preserve crossing relationships when splitting panels.

## Codex

```sh
codex mcp add software-anatomy -- node /absolute/path/to/software-anatomy/scripts/mcp-server.mjs
```

This registers the local command, without creating a provider account or API key.
See [official OpenAI MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

## Claude Desktop

Merge this entry into `mcpServers` in the client's developer configuration;
preserve existing servers:

```json
{
  "mcpServers": {
    "software-anatomy": {
      "command": "node",
      "args": ["/absolute/path/to/software-anatomy/scripts/mcp-server.mjs"]
    }
  }
}
```

Reconnect or restart the client after changing configuration. See the
[MCP local-server guide](https://modelcontextprotocol.io/docs/develop/connect-local-servers).

## Cursor

Merge into project `.cursor/mcp.json` or user `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "software-anatomy": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/software-anatomy/scripts/mcp-server.mjs"]
    }
  }
}
```

Cursor also supports `${workspaceFolder}` interpolation when this checkout is the
opened project. See [Cursor's MCP configuration](https://cursor.com/docs/mcp).

## Interoperability boundary

The integration uses standard MCP and terminal commands, without a required Codex
plugin or browser connector. Protocol tests establish server behavior; copyable
configuration does not prove every release of each GUI client has been manually
exercised. Follow the client's normal tool permissions. Keep credentials and
personal data out of shareable models and exported files.
