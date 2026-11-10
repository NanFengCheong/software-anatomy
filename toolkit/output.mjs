import { render as renderPele } from 'pele';

// CSS pixels at the final embedding size, not PNG raster resolution. A 2x raster
// still has to meet this floor when placed at the intended document width.
export const outputTargets = Object.freeze({
  document: Object.freeze({ width: 650, fontSize: 18, minFontSize: 14, overflow: 'reject' }),
  slide: Object.freeze({ width: 1120, height: 560, fontSize: 26, minFontSize: 20, overflow: 'reject' }),
  interactive: Object.freeze({ width: 960, fontSize: 18, minFontSize: 14, overflow: 'scroll' })
});

export class OutputFitError extends RangeError {
  constructor(report) {
    super(`Diagram cannot fit ${report.width} × ${report.height ?? 'auto'} px while keeping labels at least ${report.minFontSize} px. Split into panels or provide more usable space.`);
    this.name = 'OutputFitError';
    this.report = report;
  }
}

function smallestLabel(svg, base) {
  // Pele emits absolute numeric font sizes on groups/text. Inspect tag markup
  // only, so a user's label containing "font-size" cannot affect the policy.
  const sizes = [base];
  for (const tag of svg.match(/<[^>]+>/g) ?? []) {
    for (const match of tag.matchAll(/\bfont-size="([\d.]+)"/g)) sizes.push(Number(match[1]));
  }
  return Math.min(...sizes.filter(size => size > 0));
}

/** Render for the final usable content box; never silently shrink unreadably. */
export function renderForTarget(source, options = {}) {
  const preset = outputTargets[options.target ?? 'document'];
  if (!preset) throw new RangeError(`Unknown output target: ${options.target}`);
  const spec = { ...preset, ...options };
  if (!['reject', 'scroll'].includes(spec.overflow)) throw new RangeError('Invalid output overflow');
  for (const field of ['width', 'fontSize', 'minFontSize']) {
    if (!Number.isFinite(spec[field]) || spec[field] <= 0) throw new RangeError(`Invalid output ${field}`);
  }
  if (spec.height !== undefined && (!Number.isFinite(spec.height) || spec.height <= 0)) throw new RangeError('Invalid output height');
  const renderOptions = {
    idPrefix: options.idPrefix ?? 'sa-output', links: false, images: false,
    fontSize: spec.fontSize, fontFamily: 'sans-serif', padding: 22,
    responsive: false, maxWidth: spec.width, autoDirection: true,
    limit: 50000, outputLimit: 4000000, maxEdges: 5000
  };
  let result = renderPele(source, renderOptions);
  let labelSize = smallestLabel(result.svg, renderOptions.fontSize);
  if (labelSize < spec.minFontSize) {
    renderOptions.fontSize = Math.ceil(renderOptions.fontSize * spec.minFontSize / labelSize);
    result = renderPele(source, renderOptions);
    labelSize = smallestLabel(result.svg, renderOptions.fontSize);
  }
  const scaleFor = result => Math.min(1, spec.width / result.width, spec.height === undefined ? 1 : spec.height / result.height);
  let reflowed = false;
  if (labelSize * scaleFor(result) < spec.minFontSize) {
    // Pele's default breakpoint is screen-based (640px). Force a narrow-layout
    // attempt when the actual output box fails, even for a 650px document column.
    const candidate = renderPele(source, { ...renderOptions, directionBreakpoint: spec.width + 1 });
    const candidateLabel = smallestLabel(candidate.svg, renderOptions.fontSize);
    if (candidateLabel * scaleFor(candidate) > labelSize * scaleFor(result)) {
      result = candidate; labelSize = candidateLabel; reflowed = true;
    }
  }
  const fitScale = scaleFor(result);
  const scale = spec.overflow === 'scroll' ? Math.max(fitScale, spec.minFontSize / labelSize) : fitScale;
  const report = {
    target: options.target ?? 'document', width: spec.width, height: spec.height,
    naturalWidth: result.width, naturalHeight: result.height,
    displayWidth: result.width * scale, displayHeight: result.height * scale,
    minFontSize: spec.minFontSize, effectiveMinFontSize: labelSize * scale,
    reflowed, disposition: labelSize * fitScale < spec.minFontSize ? spec.overflow === 'scroll' ? 'scroll' : 'needs-panels' : 'fits'
  };
  if (report.disposition === 'needs-panels') throw new OutputFitError(report);
  // Fixed final dimensions prevent a parent's max-width rule from quietly
  // applying a second shrink. Embedders must allocate this reported content box.
  const style = `width:${report.displayWidth}px;height:${report.displayHeight}px;min-width:${report.displayWidth}px;max-width:none;max-height:none;`;
  result.svg = result.svg.replace(/(<svg\b[^>]*\bstyle=")/, `$1${style}`);
  return { ...result, report };
}
