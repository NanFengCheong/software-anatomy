#!/usr/bin/env node
import { readFile, writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { exampleDocument, agentDocument, diagramSource, renderAgentSvg } from '../toolkit/agent.mjs';
import { buildHtml } from './build.mjs';

const help = `Software Anatomy — JSON model CLI\n\n  examples --name checkout|enterprise\n  validate --input model.json\n  source --input model.json --scenario success --view sequence\n  render --input model.json --output diagram.svg [--target document --width 650 --theme dark --palette neutral]\n  build --input model.json --output walkthrough.html\n\n--example checkout|enterprise can replace --input. --input - reads JSON from stdin.\nOptional projection: --scenario ID --view architecture|sequence|erd --step N --panel ID.\nExisting output files require --force. MCP: node scripts/mcp-server.mjs\n`;

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || ['help', '--help', '-h'].includes(command)) { process.stdout.write(help); return; }
  const flags = {};
  const allowed = new Set(['name', 'input', 'example', 'output', 'force', 'scenario', 'view', 'step', 'panel', 'target', 'width', 'height', 'theme', 'palette']);
  for (let index = 0; index < args.length; index++) {
    const key = args[index].startsWith('--') ? args[index].slice(2) : '';
    if (!allowed.has(key) || Object.hasOwn(flags, key)) throw new TypeError(`Unknown or duplicate option: ${args[index]}`);
    if (key === 'force') flags[key] = true;
    else { const value = args[++index]; if (value === undefined || value.startsWith('--')) throw new TypeError(`Missing value for --${key}`); flags[key] = value; }
  }
  if (command === 'examples') { process.stdout.write(JSON.stringify(exampleDocument(flags.name ?? 'checkout'), null, 2) + '\n'); return; }
  if (!['validate', 'source', 'render', 'build'].includes(command)) throw new TypeError(`Unknown command: ${command}`);
  if (flags.input && flags.example) throw new TypeError('Supply --input or --example, not both');
  let model;
  if (flags.input === '-') {
    let bytes = 0; const chunks = [];
    for await (const chunk of process.stdin) { bytes += chunk.length; if (bytes > 1024 * 1024) throw new RangeError('Model exceeds 1 MiB'); chunks.push(chunk); }
    model = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } else if (flags.input) {
    if ((await stat(flags.input)).size > 1024 * 1024) throw new RangeError('Model exceeds 1 MiB');
    model = JSON.parse(await readFile(flags.input, 'utf8'));
  }
  const options = { ...(flags.input !== undefined ? { model } : { example: flags.example ?? 'checkout' }) };
  for (const key of ['scenario', 'view', 'panel', 'target', 'theme', 'palette']) if (flags[key] !== undefined) options[key] = flags[key];
  for (const key of ['step', 'width', 'height']) if (flags[key] !== undefined) options[key] = Number(flags[key]);
  const doc = agentDocument(options);
  if (command === 'validate') { process.stdout.write(JSON.stringify({ valid: true, components: doc.components.length, tables: doc.tables.length, scenarios: Object.keys(doc.scenarios) }) + '\n'); return; }
  if (command === 'source') { process.stdout.write(diagramSource(options).source + '\n'); return; }
  if (!flags.output) throw new TypeError(`${command} requires --output`);
  const expected = command === 'build' ? '.html' : '.svg';
  if (!flags.output.toLowerCase().endsWith(expected)) throw new TypeError(`Output must end in ${expected}`);
  const content = command === 'build' ? await buildHtml(doc) : renderAgentSvg(options).svg;
  await writeFile(resolve(flags.output), content, { flag: flags.force ? 'w' : 'wx' });
  process.stdout.write(JSON.stringify({ output: resolve(flags.output), bytes: Buffer.byteLength(content) }) + '\n');
}
main().catch(error => { process.stderr.write(`Software Anatomy: ${error.message}\n`); process.exitCode = 1; });
