#!/usr/bin/env node
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { examples, exampleDocument, agentDocument, diagramSource, renderAgentSvg } from '../toolkit/agent.mjs';
import { buildHtml } from './build.mjs';

const server = new McpServer({ name: 'software-anatomy', version: '0.1.0' });
const artifacts = new Map();
const input = { example: z.enum(['checkout', 'enterprise']).optional(), model: z.unknown().optional() };
const projection = { ...input, scenario: z.string().max(128).optional(), view: z.enum(['architecture', 'sequence', 'erd']).optional(), step: z.number().int().min(0).optional(), panel: z.string().max(128).optional() };
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const json = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
const handle = fn => async args => {
  try { return await fn(args); }
  catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }], ...(error.report ? { structuredContent: { error: error.message, report: error.report } } : {}) }; }
};
function artifact(text, mimeType, name, metadata = {}) {
  const id = createHash('sha256').update(text).digest('hex') + (mimeType === 'text/html' ? '.html' : '.svg');
  const uri = `software-anatomy://artifacts/${id}`;
  if (artifacts.has(uri)) artifacts.delete(uri);
  artifacts.set(uri, { text, mimeType, name });
  while (artifacts.size > 8) artifacts.delete(artifacts.keys().next().value);
  return { content: [{ type: 'resource_link', uri, name, mimeType, size: Buffer.byteLength(text), description: 'Read with MCP resources/read; generated locally, no file or network writes.' }], structuredContent: { uri, mimeType, bytes: Buffer.byteLength(text), ...metadata } };
}
server.registerResource('artifacts', new ResourceTemplate('software-anatomy://artifacts/{id}', {
  list: async () => ({ resources: [...artifacts].map(([uri, item]) => ({ uri, name: item.name, mimeType: item.mimeType })) })
}), { description: 'Bounded in-memory generated artifacts; retained until eviction or server exit.' }, async uri => {
  const entry = artifacts.get(uri.href);
  if (!entry) throw new Error('Artifact not found or evicted; call the generating tool again');
  return { contents: [{ uri: uri.href, mimeType: entry.mimeType, text: entry.text }] };
});
server.registerTool('list_examples', { description: 'List built-in synthetic walkthroughs.', inputSchema: {}, annotations }, handle(() => json(Object.entries(examples).map(([name, doc]) => ({ name, title: doc.title, components: doc.components.length, tables: doc.tables.length, scenarios: Object.keys(doc.scenarios) })))));
server.registerTool('get_example', { description: 'Return a complete synthetic JSON model for editing.', inputSchema: { name: z.enum(['checkout', 'enterprise']) }, annotations }, handle(({ name }) => json(exampleDocument(name))));
server.registerTool('validate_model', { description: 'Validate model identities, references and event writes. Does not prove production behavior.', inputSchema: input, annotations }, handle(args => { const doc = agentDocument(args); return json({ valid: true, components: doc.components.length, tables: doc.tables.length, scenarios: Object.keys(doc.scenarios) }); }));
server.registerTool('diagram_source', { description: 'Project a canonical model to Mermaid; includes panel continuations and global event-step mapping.', inputSchema: projection, annotations }, handle(args => json(diagramSource(args))));
server.registerTool('render_svg', { description: 'Render diagram SVG for explicit placement dimensions. Returns needs-panels if labels cannot fit. Diagram-only; continuation metadata stays in the tool result.', inputSchema: { ...projection, target: z.enum(['document', 'slide', 'interactive']).optional(), width: z.number().positive().max(4096).optional(), height: z.number().positive().max(4096).optional(), theme: z.enum(['light', 'dark']).optional(), palette: z.enum(['neutral', 'ocean', 'forest']).optional() }, annotations }, handle(args => { const result = renderAgentSvg(args); return artifact(result.svg, 'image/svg+xml', 'diagram.svg', { report: result.report, continuations: result.continuations, eventSteps: result.eventSteps }); }));
server.registerTool('build_html', { description: 'Build an offline interactive walkthrough from JSON, including browser SVG/PNG/GIF exports. Returns an MCP resource; no filesystem writes.', inputSchema: input, annotations }, handle(async args => artifact(await buildHtml(agentDocument(args)), 'text/html', 'walkthrough.html')));

await server.connect(new StdioServerTransport());
