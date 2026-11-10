import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { checkout } from '../examples/checkout.mjs';
import { validateDocument } from '../toolkit/model.mjs';
import { buildTargetExamples } from './build-targets.mjs';
import { enterprise } from '../examples/enterprise.mjs';
import { buildDemoSite } from './build-site.mjs';

const base = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Bundle a trusted runtime and an untrusted, validated document into offline HTML. */
export async function buildHtml(doc, options = {}) {
  validateDocument(doc);
  const [model, output, theme, panels, adapter, media, exports, presentation, renderer, css, pele, license, gifencSource, gifLicense] = await Promise.all(['toolkit/model.mjs', 'toolkit/output.mjs', 'toolkit/theme.mjs', 'toolkit/panels.mjs', 'toolkit/pele.mjs', 'toolkit/media.mjs', 'toolkit/exports.mjs', 'toolkit/presentation.mjs', 'toolkit/render.mjs', 'toolkit/styles.css', 'node_modules/pele/dist/pele.global.js', 'node_modules/pele/LICENSE', 'node_modules/gifenc/dist/gifenc.esm.js', 'node_modules/gifenc/LICENSE.md'].map(path => readFile(join(base, path), 'utf8')));
  const inline = source => source.replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const gifenc = gifencSource.replace(/export\{([^}]+)\};/, (_, list) => `return {${list.split(',').map(entry => { const [local, name = local] = entry.trim().split(/\s+as\s+/); return `${name}:${local}`; }).join(',')}};`).replace(/\/\/# sourceMappingURL=.*$/m, '');
  const bundle = `/* Bundled Pele license:\n${license}\n*/\n${pele}\nconst renderPele = pele.render;\n/* Bundled gifenc license:\n${gifLicense}\n*/\nconst gifenc = (() => {${gifenc}})();\n` + [model, output, theme, panels, adapter, media, exports, presentation, renderer].map(inline).join('\n');
  const json = JSON.stringify(doc).replace(/</g, '\\u003c');
  const title = String(doc.title).replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
  return `<!doctype html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="description" content="An interactive, offline software walkthrough."><title>${title} · Software Anatomy</title><style>${css}</style></head><body data-start-presentation="${options.presentation === true}"><div id="app"></div><script type="module">\n${bundle.replace(/<\/script/gi, '<\\/script')}\nmountAnatomy(document.getElementById('app'), ${json}, { presentation: document.body.dataset.startPresentation === 'true' });\n</script></body></html>\n`;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await mkdir(join(base, 'dist'), { recursive: true });
  await writeFile(join(base, 'dist/checkout.html'), await buildHtml(checkout));
  await writeFile(join(base, 'dist/checkout-presentation.html'), await buildHtml(checkout, { presentation: true }));
  await writeFile(join(base, 'dist/enterprise.html'), await buildHtml(enterprise));
  await buildTargetExamples();
  await buildDemoSite();
  console.log('Built dist/checkout.html (offline, Pele bundled)');
}
