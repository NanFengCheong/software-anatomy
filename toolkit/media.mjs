import gifenc from 'gifenc';

const { GIFEncoder, quantize, applyPalette } = gifenc;
const MAX_SVG_BYTES = 4 * 1024 * 1024;
const MAX_SOURCE_BYTES = 16 * 1024 * 1024;
const MAX_FRAME_PIXELS = 4 * 1024 * 1024;
const MAX_TOTAL_PIXELS = 48 * 1024 * 1024;
const encoder = new TextEncoder();

function abortIfNeeded(signal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Export cancelled.', 'AbortError');
}

function inspectCss(value) {
  if (/@import|\\/i.test(value)) throw new TypeError('SVG export cannot import styles or use CSS escapes.');
  for (const match of value.matchAll(/url\s*\(([^)]*)\)/gi)) {
    if (!/^(['"]?)#[A-Za-z_][\w:.-]*\1$/.test(match[1].trim())) throw new TypeError('SVG export cannot load external resources.');
  }
}

function positiveLength(value) {
  const match = String(value ?? '').trim().match(/^([\d.]+)(?:px)?$/);
  const number = match ? Number(match[1]) : NaN;
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

/** Validate self-contained generated SVG and return its final placement size. */
export function validateSvgSource(svg) {
  if (typeof svg !== 'string' || !svg.trim()) throw new TypeError('SVG source is required.');
  const bytes = encoder.encode(svg).byteLength;
  if (bytes > MAX_SVG_BYTES) throw new RangeError('SVG exceeds the 4 MiB export limit.');
  if (/<!DOCTYPE|<!ENTITY|<\?(?!xml(?:\s|\?>))/i.test(svg)) throw new TypeError('SVG export cannot declare entities or external processing instructions.');
  let root;
  if (typeof DOMParser !== 'undefined') {
    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
    root = parsed.documentElement;
    if (parsed.getElementsByTagName('parsererror').length || root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg') throw new TypeError('Export source must be valid SVG.');
    for (const element of [root, ...root.querySelectorAll('*')]) {
      if (/^(script|foreignobject|image|iframe|object|embed|audio|video|animate|animatemotion|animatetransform|set|discard)$/i.test(element.localName)) throw new TypeError('SVG export contains unsupported active or external content.');
      if (element.localName.toLowerCase() === 'style') inspectCss(element.textContent);
      for (const attribute of element.attributes) {
        if (/^on/i.test(attribute.localName)) throw new TypeError('SVG export cannot contain event handlers.');
        if (attribute.name.toLowerCase() === 'xml:base') throw new TypeError('SVG export cannot redirect its resource base.');
        if (/^(href|src)$/i.test(attribute.localName) && !/^#[A-Za-z_][\w:.-]*$/.test(attribute.value)) throw new TypeError('SVG export cannot load external resources.');
        if (attribute.localName === 'style' || /url\s*\(/i.test(attribute.value)) inspectCss(attribute.value);
      }
    }
  } else {
    // Pure Node callers can validate budgets without a DOM. Browser encoding
    // always takes the complete XML inspection above before creating an image.
    const tag = svg.match(/^\s*(?:<\?xml[^>]*>\s*)?<svg\b([^>]*)>/i);
    if (!tag) throw new TypeError('Export source must begin with SVG.');
    if (/<(?:script|foreignObject|image|iframe|object|embed|audio|video|animate|animateMotion|animateTransform|set|discard)\b/i.test(svg)) throw new TypeError('SVG export contains unsupported active or external content.');
    for (const markup of svg.match(/<[^>]+>/g) ?? []) {
      if (/\son[a-z]+\s*=/i.test(markup)) throw new TypeError('SVG export cannot contain event handlers.');
      if (/\sxml:base\s*=/i.test(markup)) throw new TypeError('SVG export cannot redirect its resource base.');
      for (const attribute of markup.matchAll(/\b(?:href|src)\s*=\s*(['"])(.*?)\1/gi)) if (!/^#[A-Za-z_][\w:.-]*$/.test(attribute[2])) throw new TypeError('SVG export cannot load external resources.');
    }
    inspectCss(svg.replace(/<text\b[^>]*>[\s\S]*?<\/text>/gi, ''));
    const attributes = new Map([...tag[1].matchAll(/([\w:-]+)\s*=\s*(['"])(.*?)\2/g)].map(match => [match[1], match[3]]));
    root = { getAttribute: name => attributes.get(name) ?? null };
  }
  const style = root.getAttribute('style') ?? '';
  const styleLength = name => positiveLength(style.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'i'))?.[1]);
  const viewBox = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  const width = styleLength('width') ?? positiveLength(root.getAttribute('width')) ?? (viewBox.length === 4 ? viewBox[2] : undefined);
  const height = styleLength('height') ?? positiveLength(root.getAttribute('height')) ?? (viewBox.length === 4 ? viewBox[3] : undefined);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) throw new RangeError('SVG requires finite positive width and height or viewBox dimensions.');
  if (width > 4096 || height > 4096 || width * height > MAX_FRAME_PIXELS) throw new RangeError('SVG exceeds the 4096px / 4 megapixel export limit. Split it into panels.');
  return { width, height, bytes };
}

export function svgBlob(svg) {
  validateSvgSource(svg);
  return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
}

/** Validate animation plans before allocating a canvas or decoding any frame. */
export function validateGifFrames(frames) {
  if (!Array.isArray(frames) || frames.length < 1 || frames.length > 120) throw new RangeError('GIF export requires 1–120 frames.');
  let width, height, sourceBytes = 0, duration = 0;
  for (const frame of frames) {
    if (!frame || !Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width <= 0 || frame.height <= 0) throw new RangeError('GIF frame dimensions must be positive integers.');
    const measured = validateSvgSource(frame.svg);
    if (Math.abs(measured.width - frame.width) > 0.01 || Math.abs(measured.height - frame.height) > 0.01) throw new RangeError('GIF frame dimensions must match the SVG placement size.');
    if (width === undefined) { width = frame.width; height = frame.height; }
    if (frame.width !== width || frame.height !== height) throw new RangeError('GIF frames must share one fixed canvas.');
    if (!Number.isFinite(frame.delay) || frame.delay < 20 || frame.delay > 60000) throw new RangeError('GIF frame delay must be 20–60000 milliseconds.');
    sourceBytes += measured.bytes; duration += frame.delay;
  }
  if (sourceBytes > MAX_SOURCE_BYTES || width * height * frames.length > MAX_TOTAL_PIXELS || duration > 180000) throw new RangeError('GIF exceeds the source, pixel-work or three-minute export budget. Use fewer events or separate panels.');
  return { width, height, frames: frames.length, sourceBytes, duration, totalPixels: width * height * frames.length };
}

async function rasterize(svg, { scale = 1, signal } = {}) {
  abortIfNeeded(signal);
  const measured = validateSvgSource(svg);
  if (!Number.isFinite(scale) || scale <= 0 || scale > 4) throw new RangeError('Raster scale must be greater than zero and no more than 4.');
  const width = Math.ceil(measured.width * scale), height = Math.ceil(measured.height * scale);
  if (width * height > 16 * 1024 * 1024 || width > 8192 || height > 8192) throw new RangeError('Raster output exceeds the 16 megapixel / 8192px limit.');
  if (typeof document === 'undefined' || typeof Image === 'undefined') throw new Error('SVG rasterization requires a browser canvas.');
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Browser could not allocate a 2D export canvas.');
  const url = URL.createObjectURL(svgBlob(svg));
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => finish(new Error('SVG image decoding timed out.')), 15000);
      const aborted = () => finish(signal.reason ?? new DOMException('Export cancelled.', 'AbortError'));
      const finish = error => {
        clearTimeout(timeout); signal?.removeEventListener('abort', aborted);
        image.onload = null; image.onerror = null;
        error ? reject(error) : resolve();
      };
      image.onload = () => finish();
      image.onerror = () => finish(new Error('Browser could not decode the exported SVG.'));
      signal?.addEventListener('abort', aborted, { once: true });
      if (signal?.aborted) { aborted(); return; }
      image.src = url;
    });
    abortIfNeeded(signal);
    context.drawImage(image, 0, 0, width, height);
    return { canvas, context, width, height };
  } catch (error) {
    canvas.width = 0; canvas.height = 0;
    throw error;
  } finally {
    image.src = ''; URL.revokeObjectURL(url);
  }
}

export async function svgToPng(svg, { scale = 2, signal } = {}) {
  const { canvas } = await rasterize(svg, { scale, signal });
  try {
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(result => result ? resolve(result) : reject(new Error('Browser PNG encoder returned no image.')), 'image/png');
    });
    abortIfNeeded(signal);
    return blob;
  } finally { canvas.width = 0; canvas.height = 0; }
}

/** Encode full, opaque SVG frames. Delays are presentation time, not trace time. */
export async function framesToGif(frames, { repeat = 0, onProgress, signal } = {}) {
  const plan = validateGifFrames(frames);
  if (!Number.isInteger(repeat) || repeat < -1 || repeat > 65535) throw new RangeError('GIF repeat must be an integer from -1 to 65535.');
  abortIfNeeded(signal);
  const gif = GIFEncoder();
  for (let index = 0; index < frames.length; index++) {
    abortIfNeeded(signal);
    const { canvas, context } = await rasterize(frames[index].svg, { signal });
    try {
      const pixels = context.getImageData(0, 0, plan.width, plan.height).data;
      // A white fallback prevents transparent input from silently becoming black.
      // Generated themed frames should already contain an opaque background.
      for (let pixel = 0; pixel < pixels.length; pixel += 4) {
        if (pixels[pixel + 3] === 255) continue;
        const alpha = pixels[pixel + 3] / 255;
        for (let channel = 0; channel < 3; channel++) pixels[pixel + channel] = Math.round(pixels[pixel + channel] * alpha + 255 * (1 - alpha));
        pixels[pixel + 3] = 255;
      }
      const palette = quantize(pixels, 256);
      const indexed = applyPalette(pixels, palette);
      gif.writeFrame(indexed, plan.width, plan.height, { palette, delay: frames[index].delay, repeat, dispose: 1 });
    } finally { canvas.width = 0; canvas.height = 0; }
    onProgress?.({ completed: index + 1, total: frames.length });
    // Release each decoded surface and yield input/progress between frames.
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  abortIfNeeded(signal);
  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}

export function downloadBlob(blob, filename) {
  if (!(blob instanceof Blob)) throw new TypeError('Download requires a Blob.');
  if (typeof filename !== 'string' || !filename || filename.length > 160 || /[\\/\u0000-\u001f]/.test(filename) || ['.', '..'].includes(filename)) throw new TypeError('Download requires a safe filename.');
  if (typeof document === 'undefined') throw new Error('Downloading an export requires a browser document.');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.hidden = true;
  document.body.append(link);
  try { link.click(); }
  finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
