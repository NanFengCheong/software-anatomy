import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { render } from 'pele';
import { renderForTarget, OutputFitError } from '../toolkit/output.mjs';

const base = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const escape = value => String(value).replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);

export async function buildTargetExamples() {
  const source = await readFile(join(base, 'examples/capture-loop.mmd'), 'utf8');
  const original = render(source, { fontSize: 18, links: false, images: false, responsive: false });
  const document = renderForTarget(source, { target: 'document' });
  let slide;
  try { renderForTarget(source, { target: 'slide' }); }
  catch (error) { if (!(error instanceof OutputFitError)) throw error; slide = error; }
  const originalMin = 18 * 650 / original.width;
  const before = original.svg.replace(/(<svg\b[^>]*\bstyle=")/, '$1width:650px;height:auto;max-width:100%;');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Readable at the destination · Software Anatomy</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f5f7f2;color:#24342c;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:1412px;margin:auto;padding:40px 28px}header{margin-bottom:30px}small{font:11px ui-monospace,monospace;letter-spacing:1px;color:#627561}h1{font-size:34px;letter-spacing:-1px;font-weight:550;margin:12px 0}p{font-size:14px;line-height:1.8;color:#627361;max-width:720px}.comparison{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}article{background:white;border:1px solid #dce4d7;border-radius:10px;overflow:hidden}h2{font-size:18px;font-weight:550;margin:0 0 10px}.caption{padding:22px;border-bottom:1px solid #e4eadd;min-height:130px}.caption p{margin:0;font-size:13px}.canvas{padding:24px 0;overflow:auto;min-height:860px;background-image:radial-gradient(#cbd8c9 .6px,transparent .6px);background-size:18px 18px}.content-box{width:650px;min-width:650px;margin:0 auto;text-align:center}svg{display:block;margin:0 auto;--pele-bg:#fff;--pele-fg:#26382c;--pele-muted:#647861;--pele-line:#6c8567;--pele-surface:#f2f6ee;--pele-border:#bacdb3;--pele-radius:7px}#unreadable .canvas{display:flex;align-items:center}.metric{display:inline-block;font:11px ui-monospace,monospace;padding:5px 8px;border-radius:4px;background:#eaf3e4;color:#3b713b;margin-bottom:12px}#unreadable .metric{background:#fff1e1;color:#92612e}.slide-notice{margin-top:24px;background:#fff8e8;border:1px solid #e6d7ae;border-radius:9px;padding:23px}.slide-notice p{margin-bottom:0}a{color:#246a4c}.note{margin-top:24px;font-size:12px}@media(max-width:1050px){.comparison{grid-template-columns:1fr}.canvas{min-height:0}#unreadable .canvas{min-height:180px}}@media(max-width:700px){main{padding:25px 14px}.content-box{margin:0}.caption{min-height:0}h1{font-size:28px}}
    </style></head><body><main><header><small>SOFTWARE ANATOMY / OUTPUT TARGETS</small><h1>Readable where it lands.</h1><p>Same seven steps, same feedback loop, same 650 px document column. The destination sets the layout and text-size constraints.</p></header><section class="comparison"><article id="unreadable"><div class="caption"><span class="metric">${originalMin.toFixed(1)} px labels after fitting</span><h2>Shrunk horizontal layout</h2><p>${original.width} px compressed into 650 px. Extra image resolution cannot recover readable physical text size.</p></div><div class="canvas"><div class="content-box">${before}</div></div></article><article id="readable"><div class="caption"><span class="metric">${document.report.effectiveMinFontSize.toFixed(0)} px labels at placement</span><h2>Layout for the document</h2><p>Reflowed vertically. All seven steps and the review feedback edge remain visible. No horizontal scrolling inside the 650 px content box.</p></div><div class="canvas"><div class="content-box">${document.svg}</div></div></article></section><section class="slide-notice" id="slide-fit"><small>FIXED SLIDE AREA / 1120 × 560 PX / 20 PX MINIMUM</small><h2 style="margin-top:10px">${slide ? 'Use separate panels for this slide.' : 'Fits the slide.'}</h2><p>${escape(slide?.message ?? 'The diagram meets the output target.')}</p></section><p class="note">SVG is sized for this destination. If a document places it at another width, render for that width and check it again. This sample is illustrative; it reproduces the layout shape in the supplied screenshot.</p><a href="capture-loop-document.svg">Open document SVG ↗</a></main></body></html>`;
  await mkdir(join(base, 'dist'), { recursive: true });
  await writeFile(join(base, 'dist/output-targets.html'), html);
  await writeFile(join(base, 'dist/capture-loop-document.svg'), document.svg);
  await writeFile(join(base, 'dist/output-target-report.json'), JSON.stringify({ original: { width: original.width, effectiveMinFontSize: originalMin }, document: document.report, slide: slide?.report ?? { disposition: 'fits' } }, null, 2) + '\n');
}
