import { snapshot, relatedIds, validateDocument, recordSummary } from './model.mjs';
import { renderPeleView } from './pele.mjs';
import { themePalette } from './theme.mjs';

const xml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function linesOf(text, width, font = '14px sans-serif') {
  const context = window.document.createElement('canvas').getContext('2d');
  context.font = font;
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    if (line && context.measureText(`${line} ${word}`).width > width) { lines.push(line); line = ''; }
    // Break an indivisible identifier rather than clipping it outside the card.
    if (context.measureText(word).width > width) {
      if (line) { lines.push(line); line = ''; }
      for (const char of word) {
        if (context.measureText(line + char).width > width && line) { lines.push(line); line = ''; }
        line += char;
      }
    } else line += `${line ? ' ' : ''}${word}`;
  }
  if (line) lines.push(line);
  return lines;
}

/** Render one fixed geometry for a frame range; only paint and record text vary. */
export function createMediaFrames(doc, options = {}) {
  validateDocument(doc);
  const scenarioId = options.scenarioId ?? Object.keys(doc.scenarios)[0];
  if (!Object.hasOwn(doc.scenarios, scenarioId)) throw new RangeError('Unknown export scenario');
  const scenario = doc.scenarios[scenarioId];
  const steps = options.steps ?? [scenario.events.length];
  if (!Array.isArray(steps) || !steps.length || steps.some(step => !Number.isInteger(step) || step < 0 || step > scenario.events.length)) throw new RangeError('Invalid export steps');
  const composition = options.composition ?? 'card';
  if (!['card', 'diagram'].includes(composition)) throw new RangeError('Unknown export composition');
  const view = options.view ?? 'sequence';
  const palette = themePalette(options.theme ?? 'light', options.palette ?? 'neutral');
  const width = options.width ?? 650;
  if (!Number.isInteger(width) || width < 320 || width > 1600) throw new RangeError('Export width must be 320–1600 CSS px');
  const panel = options.panel;
  const diagramDoc = panel?.document ?? doc;
  const selected = options.selected ?? null;
  const focus = selected ? relatedIds(doc, selected) : new Set();
  const states = steps.map(step => snapshot(doc, scenarioId, step));
  const layoutState = snapshot(doc, scenarioId, scenario.events.length);
  const context = window.document.createElement('canvas').getContext('2d');
  context.font = '18px sans-serif';
  const unit = context.measureText('W').width;
  // Reserve enough measured width for every authored value before rendering any
  // frame. SVG text is then patched without recomputing entity positions.
  for (const table of diagramDoc.tables) {
    for (const field of table.fields) {
      const values = ['not created', 'null', ...Object.values(doc.scenarios).flatMap(item => item.events.map(event => event.writes?.[table.id]?.[field])).filter(value => value !== undefined).map(String)];
      const longest = Math.max(...values.map(value => context.measureText(value).width));
      layoutState.records[table.id][field] = 'W'.repeat(Math.ceil(longest / unit) + 1);
    }
  }
  const captions = states.map(state => linesOf(state.event?.detail ?? scenario.description, width - 48));
  const maxCaptionLines = Math.max(...captions.map(lines => lines.length));
  const eventLines = states.map(state => linesOf(`Event ${state.step}/${state.total} · ${state.event?.label ?? 'Ready'}`, width - 48, '16px sans-serif'));
  const maxEventLines = Math.max(...eventLines.map(lines => lines.length));
  const footerLines = states.map(state => linesOf(`Event ${state.step}/${state.total} · ${scenario.name}`, width - 48));
  const maxFooterLines = Math.max(...footerLines.map(lines => lines.length));
  const titleLines = linesOf(doc.title, width - 48, '22px sans-serif');
  const contextLines = linesOf(`${scenario.name} · ${view}${panel ? ` · ${panel.name}` : ''}`, width - 48);
  const continuations = (panel?.continuations ?? []).flatMap(item => linesOf(`${item.fromPanel} → ${item.toPanel} · ${item.eventId ?? item.relationId} · ${item.globalStep ? `event ${item.globalStep} · ` : ''}${item.from} → ${item.to} · ${item.label}`, width - 48));
  const headerHeight = composition === 'card' ? 54 + titleLines.length * 28 + contextLines.length * 20 : 38;
  const summaries = states.map(state => diagramDoc.tables.flatMap(table => linesOf(`${table.name}: ${recordSummary(state.records[table.id])}`, width - 48)));
  const maxSummaryLines = Math.max(...summaries.map(lines => lines.length));
  const footerHeight = (composition === 'card' ? 78 + maxEventLines * 22 + maxCaptionLines * 20 + maxSummaryLines * 24 : 48 + maxFooterLines * 20) + (continuations.length ? 34 + continuations.length * 20 : 0);
  const holder = window.document.createElement('div');
  holder.style.cssText = `position:fixed;left:-20000px;top:0;width:${width - 48}px;padding:0;visibility:hidden`;
  const stage = window.document.createElement('div'); holder.append(stage); window.document.body.append(holder);
  try {
    let geometry;
    return states.map((state, index) => {
      const active = new Set(state.event ? [state.event.from, state.event.to, ...Object.keys(state.event.writes ?? {})] : []);
      renderPeleView(stage, diagramDoc, scenarioId, view, state, selected, active, focus, {
        layoutState, eventSteps: panel?.eventSteps,
        output: { target: options.target ?? 'document', width: width - 48, ...(options.height ? { height: options.height - headerHeight - footerHeight } : {}) }
      });
      const svg = stage.querySelector('svg');
      const dimensions = { width: parseFloat(svg.style.width), height: parseFloat(svg.style.height) };
      if (geometry && (dimensions.width !== geometry.width || dimensions.height !== geometry.height)) throw new Error('Export geometry changed during replay');
      geometry = dimensions;
      const height = Math.ceil(options.height ?? headerHeight + dimensions.height + footerHeight);
      const diagramY = headerHeight;
      // Nested SVG viewports use width/height attributes during image decoding;
      // keep them equal to the CSS placement dimensions used for the card budget.
      svg.setAttribute('width', dimensions.width); svg.setAttribute('height', dimensions.height);
      svg.setAttribute('x', (width - dimensions.width) / 2); svg.setAttribute('y', diagramY);
      svg.style.setProperty('--pele-bg', palette.surface); svg.style.setProperty('--pele-fg', palette.ink);
      svg.style.setProperty('--pele-muted', palette.muted); svg.style.setProperty('--pele-line', palette.diagramLine);
      svg.style.setProperty('--pele-surface', palette.diagramSurface); svg.style.setProperty('--pele-surface-alt', palette.diagramAlt);
      svg.style.setProperty('--pele-border', palette.diagramBorder); svg.style.setProperty('--pele-accent', palette.accent);
      const paint = `<style>.diagram-node.is-active{--_s:${palette.accentSoft};--_b:${palette.accent}}.diagram-node.is-selected{--_s:${palette.selectedSoft};--_b:${palette.selected}}.is-active>rect,.is-selected>rect{stroke-width:2}.pele-edge.current-connector{--_l:${palette.accent};stroke:${palette.accent};stroke-width:2}.pele-edge.current-connector.warning-line{--_l:${palette.amber};stroke:${palette.amber}}.sequence-event.future{opacity:.65}.sequence-event .message-hit{fill:transparent}.sequence-event.current-message .message-hit{fill:${palette.accentSoft}}.sequence-event.current-message .pele-edge-label{fill:${palette.accent};font-weight:bold}.sequence-event.current-message.warning-line .pele-edge-label{fill:${palette.amber}}.pele-er-comment.field-changed{fill:${palette.accent};font-weight:bold}</style>`;
      const text = (value, x, y, size = 14, color = palette.ink, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" ${extra}>${xml(value)}</text>`;
      let body = paint + `<rect width="${width}" height="${height}" fill="${palette.surface}"/>`;
      body += text('SOFTWARE ANATOMY · SIMULATED', 24, 25, 11, palette.muted);
      if (composition === 'card') {
        titleLines.forEach((line, index) => { body += text(line, 24, 55 + index * 28, 22); });
        contextLines.forEach((line, index) => { body += text(line, 24, 55 + titleLines.length * 28 + index * 20, 14, palette.muted); });
      }
      body += svg.outerHTML;
      const bottom = diagramY + dimensions.height + 24;
      if (composition === 'card') {
        eventLines[index].forEach((line, lineIndex) => { body += text(line, 24, bottom + lineIndex * 22, 16, palette.ink, lineIndex === 0 ? 'data-export-caption="true"' : ''); });
        const captionY = bottom + maxEventLines * 22 + 3;
        captions[index].forEach((line, lineIndex) => { body += text(line, 24, captionY + lineIndex * 20, 14, palette.muted); });
        const recordY = captionY + maxCaptionLines * 20 + 20;
        summaries[index].forEach((line, lineIndex) => { body += text(line, 24, recordY + lineIndex * 24, 14, palette.muted); });
      } else footerLines[index].forEach((line, lineIndex) => { body += text(line, 24, bottom + lineIndex * 20, 14, palette.muted); });
      if (continuations.length) {
        const start = height - continuations.length * 20 - 22;
        body += text('CROSS-PANEL CONTINUATIONS', 24, start - 22, 12, palette.muted);
        continuations.forEach((line, index) => { body += text(line, 24, start + index * 20, 14, palette.muted); });
      }
      return {
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="font-family:sans-serif;background:${palette.surface}" role="img" aria-label="${xml(`${doc.title}, ${scenario.name}, event ${state.step}`)}">${body}</svg>`,
        width, height, delay: index === states.length - 1 ? 2200 : 1000,
        step: state.step, theme: options.theme ?? 'light', palette: options.palette ?? 'neutral', eventId: state.event?.id ?? null,
        diagramGeometry: dimensions, minFontSize: Number(stage.dataset.minFontSize)
      };
    });
  } finally { holder.remove(); }
}
