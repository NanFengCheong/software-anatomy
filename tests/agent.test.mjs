import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { diagramSource, renderAgentSvg } from '../toolkit/agent.mjs';

const exec = promisify(execFile);
test('agent projections preserve canonical steps and enterprise continuations', () => {
  const result = diagramSource({ example: 'enterprise', scenario: 'compensation', view: 'sequence', panel: 'resolution' });
  assert.ok(result.eventSteps[0] > 1); assert.equal(result.eventSteps.at(-1), 24);
  assert.ok(result.continuations.length); assert.ok(result.source.includes('sequenceDiagram'));
  const panelSvg = renderAgentSvg({ example: 'enterprise', scenario: 'compensation', view: 'sequence', panel: 'resolution', width: 960 });
  assert.ok(panelSvg.svg.includes('<metadata>')); assert.ok(panelSvg.svg.includes('request-refund'));
  const svg = renderAgentSvg({ example: 'checkout', view: 'architecture', theme: 'dark', width: 650 });
  assert.ok(svg.svg.includes('#18181b')); assert.ok(svg.report.effectiveMinFontSize >= 14);
  assert.throws(() => renderAgentSvg({ palette: 'invalid' }), RangeError);
});
test('CLI validates and writes offline HTML without overwriting an existing file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'anatomy-cli-'));
  try {
    const cli = resolve('scripts/cli.mjs');
    const checked = await exec(process.execPath, [cli, 'validate', '--example', 'checkout'], { cwd: dir });
    assert.equal(JSON.parse(checked.stdout).valid, true);
    const file = join(dir, 'walkthrough.html');
    await exec(process.execPath, [cli, 'build', '--example', 'checkout', '--output', file], { cwd: dir });
    assert.ok((await readFile(file, 'utf8')).includes('mountAnatomy'));
    const svg = join(dir, 'ocean.svg');
    await exec(process.execPath, [cli, 'render', '--example', 'checkout', '--theme', 'dark', '--palette', 'ocean', '--output', svg], { cwd: dir });
    assert.ok((await readFile(svg, 'utf8')).includes('#121f30'));
    await assert.rejects(exec(process.execPath, [cli, 'build', '--example', 'checkout', '--output', file], { cwd: dir }));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('standard MCP client discovers tools, invokes them and reads generated resources', async () => {
  const client = new Client({ name: 'anatomy-contract-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('scripts/mcp-server.mjs')], stderr: 'pipe' });
  let stderr = ''; transport.stderr?.on('data', chunk => { stderr += chunk; });
  try {
    await client.connect(transport);
    const tools = await client.listTools(); assert.equal(tools.tools.length, 6);
    const list = await client.callTool({ name: 'list_examples', arguments: {} });
    assert.equal(JSON.parse(list.content[0].text).length, 2);
    const valid = await client.callTool({ name: 'validate_model', arguments: { example: 'enterprise' } }); assert.equal(JSON.parse(valid.content[0].text).valid, true);
    const invalid = await client.callTool({ name: 'validate_model', arguments: { model: {} } }); assert.equal(invalid.isError, true);
    const nullModel = await client.callTool({ name: 'validate_model', arguments: { model: null } }); assert.equal(nullModel.isError, true);
    const source = await client.callTool({ name: 'diagram_source', arguments: { example: 'enterprise', scenario: 'compensation', view: 'sequence', panel: 'resolution' } }); assert.equal(JSON.parse(source.content[0].text).eventSteps.at(-1), 24);
    const rendered = await client.callTool({ name: 'render_svg', arguments: { example: 'checkout', view: 'architecture', theme: 'dark', palette: 'ocean' } });
    assert.equal(rendered.content[0].type, 'resource_link');
    const svg = await client.readResource({ uri: rendered.content[0].uri }); assert.ok(svg.contents[0].text.includes('#121f30'));
    const built = await client.callTool({ name: 'build_html', arguments: { example: 'checkout' } });
    const html = await client.readResource({ uri: built.content[0].uri }); assert.ok(html.contents[0].text.includes('framesToGif'));
    assert.equal(stderr, '');
  } finally { await client.close(); }
});
