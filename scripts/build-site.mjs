import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { checkout } from '../examples/checkout.mjs';
import { enterprise } from '../examples/enterprise.mjs';
import { snapshot } from '../toolkit/model.mjs';
import { createMermaid } from '../toolkit/pele.mjs';
import { renderForTarget } from '../toolkit/output.mjs';

const base = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function buildDemoSite() {
  const dist = join(base, 'dist');
  await mkdir(join(dist, 'assets'), { recursive: true });
  await mkdir(join(dist, 'examples'), { recursive: true });
  const source = createMermaid(checkout, 'success', 'architecture', snapshot(checkout, 'success', 0)).source;
  const overview = renderForTarget(source, { target: 'document', width: 650 }).svg;
  const index = (await readFile(join(base, 'site/index.html'), 'utf8')).replace('<!-- overview -->', overview);
  await writeFile(join(dist, 'index.html'), index);
  await writeFile(join(dist, '.nojekyll'), '');
  for (const [from, to] of [['site/styles.css', 'assets/site.css'], ['site/site.mjs', 'assets/site.mjs'], ['site/favicon.svg', 'assets/favicon.svg'], ['toolkit/theme.mjs', 'assets/theme.mjs'], ['site/assets/checkout-success-light.gif', 'assets/checkout-success-light.gif'], ['site/assets/checkout-timeout-dark.gif', 'assets/checkout-timeout-dark.gif']]) await copyFile(join(base, from), join(dist, to));
  for (const [name, model] of Object.entries({ checkout, enterprise })) await writeFile(join(dist, `examples/${name}.json`), JSON.stringify(model, null, 2) + '\n');
  await writeFile(join(dist, 'agent-tools.json'), JSON.stringify({
    name: 'Software Anatomy', version: '0.1.0',
    repository: 'https://github.com/NanFengCheong/software-anatomy',
    skill: 'https://raw.githubusercontent.com/NanFengCheong/software-anatomy/main/SKILL.md',
    documentation: 'https://github.com/NanFengCheong/software-anatomy/blob/main/references/agent-integration.md',
    transport: 'local-stdio', remoteEndpoint: null,
    setup: ['git clone https://github.com/NanFengCheong/software-anatomy.git', 'npm ci'],
    mcp: { command: 'node', args: ['/absolute/path/to/software-anatomy/scripts/mcp-server.mjs'], tools: ['list_examples', 'get_example', 'validate_model', 'diagram_source', 'render_svg', 'build_html'] },
    cli: 'node scripts/cli.mjs --help',
    examples: ['examples/checkout.json', 'examples/enterprise.json'],
    note: 'GitHub Pages is static hosting. Run the MCP server locally; this manifest is descriptive, not a remote MCP endpoint.'
  }, null, 2) + '\n');
}
