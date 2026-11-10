import { checkout } from '../examples/checkout.mjs';
import { enterprise } from '../examples/enterprise.mjs';
import { validateDocument, snapshot } from './model.mjs';
import { createMermaid } from './pele.mjs';
import { planPanels } from './panels.mjs';
import { renderForTarget } from './output.mjs';
import { themePalette } from './theme.mjs';

export const examples = Object.freeze({ checkout, enterprise });

export function exampleDocument(name) {
  if (!Object.hasOwn(examples, name)) throw new RangeError(`Unknown example: ${name}`);
  return structuredClone(examples[name]);
}

export function agentDocument({ model, example } = {}) {
  if (model !== undefined && example !== undefined) throw new TypeError('Supply model or example, not both');
  const doc = model !== undefined ? model : exampleDocument(example ?? 'checkout');
  if (Buffer.byteLength(JSON.stringify(doc), 'utf8') > 1024 * 1024) throw new RangeError('Model exceeds 1 MiB; use a bounded document');
  return validateDocument(doc);
}

export function diagramSource(options = {}) {
  const doc = agentDocument(options);
  const scenario = options.scenario ?? Object.keys(doc.scenarios)[0];
  const view = options.view ?? 'architecture';
  const step = options.step ?? doc.scenarios[scenario]?.events.length;
  const state = snapshot(doc, scenario, step);
  const panels = planPanels(doc, scenario, view);
  const panel = options.panel ? panels.find(item => item.id === options.panel) : undefined;
  if (options.panel && !panel) throw new RangeError(`Unknown panel: ${options.panel}`);
  const projection = createMermaid(panel?.document ?? doc, scenario, view, state);
  return { source: projection.source, scenario, view, step, panel: panel?.id ?? null,
    eventSteps: panel?.eventSteps ?? doc.scenarios[scenario].events.map((_, index) => index + 1),
    continuations: panel?.continuations ?? [], availablePanels: panels.map(({ id, name }) => ({ id, name })) };
}

export function renderAgentSvg(options = {}) {
  const projection = diagramSource(options);
  const palette = themePalette(options.theme ?? 'light');
  const result = renderForTarget(projection.source, { target: options.target ?? 'document', ...(options.width !== undefined ? { width: options.width } : {}), ...(options.height !== undefined ? { height: options.height } : {}) });
  const colors = `--pele-bg:${palette.surface};--pele-fg:${palette.ink};--pele-muted:${palette.muted};--pele-line:${palette.diagramLine};--pele-surface:${palette.diagramSurface};--pele-surface-alt:${palette.diagramAlt};--pele-border:${palette.diagramBorder};background:${palette.surface};`;
  const escaped = value => String(value).replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
  const metadata = { scenario: projection.scenario, view: projection.view, step: projection.step, panel: projection.panel, eventSteps: projection.eventSteps, continuations: projection.continuations };
  const description = projection.continuations.map(link => `${link.fromPanel} -> ${link.toPanel}: ${link.eventId ?? link.relationId}; ${link.from} -> ${link.to}; ${link.label}`).join('\n');
  const svg = result.svg.replace(/(<svg\b[^>]*\bstyle=")/, `$1${colors}`).replace(/<svg\b[^>]*>/, tag => `${tag}<metadata>${escaped(JSON.stringify(metadata))}</metadata><desc>${escaped(description || `Simulated ${projection.view} diagram, event ${projection.step}`)}</desc>`);
  return { ...projection, svg, report: result.report, theme: options.theme ?? 'light' };
}
