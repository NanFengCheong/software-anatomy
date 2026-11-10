import { test } from 'node:test';
import assert from 'node:assert/strict';
import { svgBlob, validateSvgSource, validateGifFrames, framesToGif, svgToPng } from '../toolkit/media.mjs';

const svg = (width = 320, height = 180) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/><text x="12" y="30">A &amp; B</text></svg>`;
const frame = (options = {}) => ({ svg: svg(), width: 320, height: 180, delay: 800, ...options });

test('SVG keeps explicit final placement size and produces a typed UTF-8 blob', async () => {
  assert.deepEqual(validateSvgSource(svg()), { width: 320, height: 180, bytes: new TextEncoder().encode(svg()).length });
  const source = svg(640, 360).replace('viewBox=', 'style="width:320px;height:180px;" viewBox=');
  assert.equal(validateSvgSource(source).width, 320);
  const blob = svgBlob(source);
  assert.equal(blob.type, 'image/svg+xml;charset=utf-8');
  assert.equal(await blob.text(), source);
});

test('SVG export rejects remote resources, handlers, active markup and oversize geometry', () => {
  for (const source of [
    '<html>no SVG</html>',
    svg().replace('<rect ', '<rect onclick="alert(1)" '),
    svg().replace('<rect ', '<image href="https://example.com/pixel"/><rect '),
    svg().replace('<rect ', '<script>alert(1)</script><rect '),
    svg().replace('<rect ', '<set attributeName="href" to="https://example.com/pixel"/><rect '),
    svg().replace('<rect ', '<animate attributeName="href" values="https://example.com/pixel"/><rect '),
    svg().replace('<rect ', '<use href="data:image/svg+xml,x"/><rect '),
    svg().replace('<rect ', '<style>@import "https://example.com/font.css";</style><rect '),
    svg().replace('fill="#fff"', 'fill="url(https://example.com/image)"'),
    '<!DOCTYPE svg SYSTEM "https://example.com"><svg width="10" height="10"/>',
    '<?xml-stylesheet href="https://example.com/styles.css"?>' + svg(),
    svg().replace('<svg ', '<svg xml:base="https://example.com/" '),
    svg(5000, 5000)
  ]) assert.throws(() => validateSvgSource(source));
  assert.equal(validateSvgSource(svg().replace('fill="#fff"', 'fill="url(#paint)"')).width, 320);
});

test('GIF validates matching canvases, exact presentation delays and bounded work', () => {
  const plan = validateGifFrames([frame(), frame({ delay: 2400 })]);
  assert.equal(plan.duration, 3200);
  assert.equal(plan.totalPixels, 320 * 180 * 2);
  for (const frames of [[], Array(121).fill(frame()), [frame({ width: 321 })], [frame(), frame({ svg: svg(321, 180), width: 321 })], [frame({ delay: 0 })], [frame({ delay: Infinity })], [frame({ width: 0 })], Array(120).fill(frame({ svg: svg(1000, 1000), width: 1000, height: 1000 }))]) assert.throws(() => validateGifFrames(frames), RangeError);
});

test('cancelled media export stops before allocating image surfaces', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(framesToGif([frame()], { signal: controller.signal }), error => error.name === 'AbortError');
  await assert.rejects(svgToPng(svg(), { signal: controller.signal }), error => error.name === 'AbortError');
  await assert.rejects(framesToGif([frame()], { repeat: -2 }), RangeError);
  await assert.rejects(svgToPng(svg(), { scale: 9 }), RangeError);
});
