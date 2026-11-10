import assert from 'node:assert/strict';
import { readFile, stat, readdir } from 'node:fs/promises';
import { dirname, resolve, join, relative } from 'node:path';

const root = resolve('dist');
const expected = ['index.html', 'checkout.html', 'enterprise.html', 'output-targets.html', 'agent-tools.json', 'assets/site.mjs', 'assets/theme.mjs', 'assets/site.css', 'assets/checkout-success-light.gif', 'assets/checkout-timeout-dark.gif', 'examples/checkout.json', 'examples/enterprise.json', '.nojekyll'];
for (const file of expected) assert.ok((await stat(join(root, file))).isFile(), `Missing build file: ${file}`);
for (const file of ['index.html', 'checkout.html', 'enterprise.html', 'output-targets.html']) {
  const html = await readFile(join(root, file), 'utf8');
  assert.ok(!html.includes('/Users/'), `Workstation path in ${file}`);
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  for (const match of markup.matchAll(/\b(?:href|src)="([^"#]+)"/g)) {
    const value = match[1];
    if (/^(?:https?:|data:|blob:|mailto:)/.test(value)) continue;
    let path = resolve(dirname(join(root, file)), value.split(/[?#]/)[0]);
    assert.ok(path === root || path.startsWith(root + '/'), `Root-relative or escaping link: ${value}`);
    if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
    assert.ok((await stat(path)).isFile(), `Broken ${file} link: ${value}`);
  }
}
const manifest = JSON.parse(await readFile(join(root, 'agent-tools.json'), 'utf8'));
assert.equal(manifest.transport, 'local-stdio'); assert.equal(manifest.remoteEndpoint, null); assert.equal(manifest.mcp.tools.length, 6);
async function inventory(dir) { return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(entry => entry.isDirectory() ? inventory(join(dir, entry.name)) : relative(root, join(dir, entry.name))))).flat(); }
const files = await inventory(root);
assert.ok(files.every(file => !/^(?:output|node_modules|\.git)\//.test(file)));
console.log(`PASS: ${files.length} static-site files; relative links and local agent manifest verified`);
