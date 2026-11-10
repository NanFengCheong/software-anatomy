# Browser media encoders

`toolkit/media.mjs` consumes complete, self-contained SVG. The caller supplies
theme colors, opaque background, final placement dimensions and animation layout.
The encoder never scales diagrams to fit a destination or changes record state.
`createMediaFrames` accepts `theme: 'light' | 'dark'` and
`palette: 'neutral' | 'ocean' | 'forest'` (default Neutral). Browser exports capture
both before encoding; later UI changes do not recolor frames already in progress.

- `svgBlob(svg)` → typed SVG Blob.
- `svgToPng(svg, { scale = 2, signal } = {})` → Promise of PNG Blob. Scale changes
  raster density; final document placement still determines readable text size.
- `framesToGif(frames, { repeat = 0, onProgress, signal } = {})` → Promise of GIF
  Blob. Each frame is `{ svg, width, height, delay }`; width/height are fixed integer
  placement pixels and delay is presentation milliseconds. GIF stores delays in
  centiseconds. `repeat: -1` plays once; `0` loops. Progress receives
  `{ completed, total }`. A longer last delay provides the final-state hold.
- `downloadBlob(blob, filename)` starts a browser download and revokes its URL.
- `validateSvgSource` and `validateGifFrames` expose preflight checks.

Browser XML inspection rejects external resources, handlers, active markup,
external stylesheet processing instructions, entities and redirected XML bases
before creating an image. Local fragment references remain available for markers
and gradients. The Node validation path supports generated-SVG dimensions and
budget tests; it is not a general-purpose SVG sanitizer.

Limits: 4 MiB source and 4096px/4 megapixels at placement; PNG raster at most
8192px/16 megapixels. GIF plans allow 1–120 frames, 16 MiB combined sources,
48 megapixels of total pixel work, and three minutes of presentation. Oversize
plans fail before rasterization; use fewer events or separate panels. One decoded
frame is retained at a time, and encoding yields between frames. Abort is checked
before each frame and after encoding; synchronous palette quantization completes
before cancellation takes effect.

The pinned gifenc dependency supplies GIFEncoder, quantize and applyPalette.
Browser HTML exports bundle it locally with its license; no worker/CDN is required.
GIF palettes contain up to 256 colors per frame. Supply an opaque theme background;
remaining transparency is flattened to white as a deterministic fallback.
