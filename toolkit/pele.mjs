import { renderForTarget } from './output.mjs';

// Encode syntax delimiters before giving labels to Mermaid's parsers. IDs are
// generated aliases; author-controlled display strings never become statements.
export const mermaidText = value => String(value).replace(/[^\p{L}\p{N} _.,/-]/gu, char => `#${char.codePointAt(0)};`);

/** Generate Mermaid syntax plus explicit maps back to the shared domain IDs. */
export function createMermaid(doc, scenarioId, view, state) {
  const nodes = new Map(), edges = new Map(), messages = new Map();
  const aliases = new Map(doc.components.map((item, index) => [`c${index}`, item.id]));
  const componentAlias = id => [...aliases].find(([, stableId]) => id === stableId)[0];
  let lines;
  if (view === 'architecture') {
    for (const [alias, id] of aliases) nodes.set(alias, id);
    lines = ['architecture-beta'];
    const groups = new Map();
    (doc.boundaries ?? []).forEach((boundary, index) => {
      lines.push(`group g${index}(cloud)[${mermaidText(boundary.name)}]`);
      for (const id of boundary.members ?? []) groups.set(id, `g${index}`);
    });
    for (const item of doc.components) {
      const icon = item.kind === 'CLIENT' ? 'internet' : item.kind === 'EXTERNAL' ? 'cloud' : 'server';
      lines.push(`service ${componentAlias(item.id)}(${icon})[${mermaidText(item.name)}]${groups.has(item.id) ? ` in ${groups.get(item.id)}` : ''}`);
    }
    const pairs = new Set();
    for (const event of doc.scenarios[scenarioId].events) {
      const pair = [event.from, event.to].sort().join(':');
      if (pairs.has(pair) || event.from === event.to) continue;
      pairs.add(pair);
      const from = doc.components.find(item => item.id === event.from), to = doc.components.find(item => item.id === event.to);
      const a = componentAlias(from.id), b = componentAlias(to.id);
      const vertical = from.x === to.x;
      const ports = vertical ? from.y < to.y ? ['B', 'T'] : ['T', 'B'] : from.x < to.x ? ['R', 'L'] : ['L', 'R'];
      const both = doc.scenarios[scenarioId].events.some(item => item.from === event.to && item.to === event.from);
      lines.push(`${a}:${ports[0]} ${both ? '<-->' : '-->'} ${ports[1]}:${b}`);
      edges.set(`${a}-${b}`, [event.from, event.to]);
    }
  } else if (view === 'sequence') {
    for (const [alias, id] of aliases) nodes.set(alias, id);
    lines = ['sequenceDiagram'];
    for (const item of doc.components) lines.push(`participant ${componentAlias(item.id)} as ${mermaidText(item.name)}`);
    doc.scenarios[scenarioId].events.forEach((event, index) => {
      // One authored event = one Mermaid message. No notes/activation statements
      // are inserted, so Pele's iN message IDs map directly to replay steps.
      lines.push(`${componentAlias(event.from)}${event.tone === 'warning' ? '-->>' : '->>'}${componentAlias(event.to)}: ${mermaidText(event.label)}`);
      messages.set(`i${index}`, { event, step: index + 1 });
    });
  } else if (view === 'erd') {
    lines = ['erDiagram', 'direction LR'];
    const tableAlias = new Map(doc.tables.map((table, index) => [table.id, `t${index}`]));
    for (const table of doc.tables) {
      const alias = tableAlias.get(table.id);
      nodes.set(alias, table.id);
      lines.push(`${alias}["${mermaidText(table.name)}"] {`);
      for (const field of table.fields) {
        const values = Object.values(doc.scenarios).flatMap(scenario => scenario.events.map(event => event.writes?.[table.id]?.[field]));
        const example = values.find(value => value !== undefined && value !== null);
        const type = typeof example === 'number' ? 'number' : typeof example === 'boolean' ? 'boolean' : 'string';
        const key = field === 'id' ? ' PK' : doc.relations.some(rel => rel.from === table.id && rel.field === field) ? ' FK' : '';
        const record = state.records[table.id];
        const value = Object.hasOwn(record, field) ? record[field] === null ? 'null' : String(record[field]) : '—';
        lines.push(`  ${type} ${field}${key} "${mermaidText(value)}"`);
      }
      lines.push('}');
    }
    // Every current FK is mandatory many-to-one and non-identifying: child PKs
    // are independent IDs, not composites including the parent's PK.
    for (const rel of doc.relations) lines.push(`${tableAlias.get(rel.to)} ||..o{ ${tableAlias.get(rel.from)} : "${mermaidText(rel.field)}"`);
  } else throw new RangeError(`Unknown Mermaid view: ${view}`);
  return { source: lines.join('\n'), nodes, edges, messages };
}

/** Adapt Pele SVG hooks to the existing selection and playback controller. */
export function renderPeleView(container, doc, scenarioId, view, state, selected, active, focus, options = {}) {
  const diagram = createMermaid(doc, scenarioId, view, options.layoutState ?? state);
  const parent = container.parentElement;
  const padding = window.getComputedStyle(parent);
  const width = Math.max(64, parent.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight));
  const result = renderForTarget(diagram.source, { target: 'interactive', width, idPrefix: `sa-${view}`, ...options.output });
  container.innerHTML = result.svg;
  container.dataset.renderer = 'pele';
  container.dataset.mermaidType = result.type;
  container.style.minWidth = `${result.report.displayWidth}px`;
  container.style.width = `${result.report.displayWidth}px`;
  container.style.flexShrink = '0';
  container.style.marginInline = result.report.displayWidth <= width ? 'auto' : '0';
  container.dataset.layout = result.report.disposition;
  container.dataset.minFontSize = result.report.effectiveMinFontSize;
  const svg = container.querySelector('svg');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', `${doc.title} ${view} diagram`);
  for (const node of svg.querySelectorAll('.pele-node')) {
    const id = diagram.nodes.get(node.dataset.id);
    if (!id) throw new Error(`Unmapped Pele node: ${node.dataset.id}`);
    // Footer actors repeat participant IDs. Leave them visible but make just the
    // header interactive, avoiding duplicate controls for screen readers.
    if (node.classList.contains('pele-actor-footer')) { node.setAttribute('aria-hidden', 'true'); continue; }
    const item = doc.components.find(item => item.id === id) ?? doc.tables.find(item => item.id === id);
    node.dataset.select = id;
    node.setAttribute('role', 'button'); node.setAttribute('tabindex', '0');
    node.setAttribute('aria-label', `Inspect ${item.name}`); node.setAttribute('aria-pressed', String(selected === id));
    node.classList.add('diagram-node');
    node.classList.toggle('is-active', active.has(id)); node.classList.toggle('is-selected', focus.has(id));
    if (view === 'erd') {
      const rows = node.querySelectorAll('.pele-er-name');
      item.fields.forEach((field, index) => {
        const y = rows[index]?.getAttribute('y');
        const comment = y === undefined ? null : node.querySelector(`.pele-er-comment[y="${y}"]`);
        if (!comment) return;
        if (options.layoutState) comment.textContent = Object.hasOwn(state.records[id], field) ? String(state.records[id][field]) : 'not created';
        if (Object.hasOwn(state.event?.writes?.[id] ?? {}, field)) comment.classList.add('field-changed');
      });
    }
  }
  if (view === 'architecture') {
    for (const edge of svg.querySelectorAll('.pele-edge')) {
      const pair = diagram.edges.get(edge.dataset.id);
      if (!pair) throw new Error(`Unmapped Pele edge: ${edge.dataset.id}`);
      const current = state.event && pair.includes(state.event.from) && pair.includes(state.event.to);
      if (current) edge.classList.add('current-connector');
      if (current && state.event.tone === 'warning') edge.classList.add('warning-line');
    }
  }
  if (view === 'sequence') {
    const messageNodes = svg.querySelectorAll('.pele-message');
    if (messageNodes.length !== diagram.messages.size) throw new Error('Pele message count differs from replay events');
    for (const node of messageNodes) {
      const entry = diagram.messages.get(node.dataset.id);
      if (!entry) throw new Error(`Unmapped Pele message: ${node.dataset.id}`);
      entry.step = options.eventSteps?.[entry.step - 1] ?? entry.step;
      const label = svg.querySelector(`.pele-edge-label[data-id="${node.dataset.id}"]`);
      if (!label) throw new Error(`Missing Pele message label: ${node.dataset.id}`);
      // Keep line and label in one keyboard target. Their coordinate systems are
      // shared in Pele 1.13.0; explicit fill overrides the edge group's fill:none.
      label.setAttribute('fill', 'var(--_fg)'); label.setAttribute('stroke', 'none');
      node.append(label);
      node.dataset.seek = entry.step; node.dataset.eventId = entry.event.id;
      node.setAttribute('role', 'button'); node.setAttribute('tabindex', '0');
      node.setAttribute('aria-label', `Jump to event ${entry.step}: ${entry.event.label}`);
      node.setAttribute('aria-pressed', String(entry.step === state.step));
      node.classList.add('sequence-event', entry.step <= state.step ? 'visited' : 'future');
      if (entry.step === state.step) node.classList.add('current-message', 'current-connector');
      if (entry.event.tone === 'warning') node.classList.add('warning-line');
      const bounds = node.getBBox();
      const hit = window.document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      hit.setAttribute('x', bounds.x - 4); hit.setAttribute('y', bounds.y - 4);
      hit.setAttribute('width', Math.max(24, bounds.width + 8)); hit.setAttribute('height', bounds.height + 8);
      hit.setAttribute('fill', 'transparent'); hit.setAttribute('stroke', 'none'); hit.classList.add('message-hit');
      node.prepend(hit);
    }
  }
  return diagram.source;
}
