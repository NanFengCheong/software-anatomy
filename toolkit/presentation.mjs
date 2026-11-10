import { snapshot, recordSummary } from './model.mjs';

const presentEscape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const presentationSymbols = {
  window: '<rect x="-45" y="-34" width="90" height="68" rx="5"/><path d="M-45-16H45M-31-25h2m8 0h2M-26 2h38m-38 13H1"/><path class="symbol-accent" d="m15 2 21 13-11 3-4 12Z"/>',
  receipt: '<path d="M-29-44H29V44l-10-6-10 6-9-6-10 6-10-6-9 6Z"/><path d="M-15-23H15m-30 15H15m-30 15H4m-19 18H15"/>',
  stock: '<path d="m0-42 38 21v44L0 44l-38-21v-44ZM-38-21 0 0l38-21M0 0v44M-19-31 19-10v16"/>',
  card: '<rect x="-46" y="-30" width="92" height="60" rx="7"/><path d="M-46-11H46m-76 26h16m8 0h8"/><rect class="symbol-accent" x="19" y="9" width="13" height="9" rx="2"/>',
  bank: '<path d="m-45-19 45-29 45 29Zm6 9h78m-73 4v39m22-39v39m22-39v39m22-39v39M-43 35H43m-88 10H45"/>',
  clock: '<circle r="35"/><path d="M0-23V0l17 10M-31-41l-12 1 1 13m-1-13a54 54 0 0 1 89 21"/>'
};

/** One connected layout across all events and scenarios; canonical snapshots supply state. */
export function presentationMarkup(doc, scenarioId, step, selected) {
  const esc = presentEscape, scenario = doc.scenarios[scenarioId];
  const state = snapshot(doc, scenarioId, step), previous = snapshot(doc, scenarioId, Math.max(0, step - 1));
  const event = state.event, scene = step ? scenario.presentation.scenes[step - 1] : scenario.presentation.intro;
  const warning = event?.tone === 'warning', end = step === scenario.events.length;
  const locations = doc.presentation.layout;
  const positions = new Map(locations.map(item => [item.id, item]));
  const components = new Map(doc.components.map(item => [item.id, item]));
  const evidence = (scene.evidence ?? []).map(id => doc.tables.find(table => table.id === id));
  const source = event ? components.get(event.from) : null, target = event ? components.get(event.to) : null;
  const channel = item => [item.from, item.to].sort().join(':');
  const channels = [...new Map(Object.values(doc.scenarios).flatMap(item => item.events).map(item => [channel(item), item])).entries()];
  const traversed = new Set(scenario.events.slice(0, step).map(channel));
  function endpoints(item) {
    const a = positions.get(item.from), b = positions.get(item.to), dx = b.x - a.x, dy = b.y - a.y;
    return Math.abs(dx) >= Math.abs(dy)
      ? [a.x + Math.sign(dx) * 64, a.y, b.x - Math.sign(dx) * 64, b.y]
      : [a.x, a.y + (dy > 0 ? 92 : -62), b.x, b.y + (dy > 0 ? -62 : 92)];
  }
  const link = item => { const [x1, y1, x2, y2] = endpoints(item); return `M${x1},${y1} L${x2},${y2}`; };
  const current = event ?? channels[0][1], [x1, y1, x2, y2] = endpoints(current);
  const selectedItem = components.get(selected) ?? doc.tables.find(item => item.id === selected);
  return `<div class="presentation-heading"><span class="presentation-series">SOFTWARE ANATOMY <span>/</span> ${esc(doc.title.toUpperCase())}</span><div class="presentation-scenarios" role="group" aria-label="Presentation scenario">${Object.entries(doc.scenarios).filter(([, item]) => item.presentation).map(([id, item]) => `<button data-scenario="${esc(id)}" aria-pressed="${id === scenarioId}">${esc(item.short ?? item.name)}</button>`).join('')}</div><span class="presentation-simulation">SIMULATED</span></div>
    <div class="presentation-scene ${warning ? 'scene-warning' : ''} ${end ? 'scene-ending' : ''}" data-scene="${esc(event?.id ?? 'intro')}">
      <div class="scene-copy"><span class="scene-number">${String(step).padStart(2, '0')}<span> / ${String(scenario.events.length).padStart(2, '0')}</span></span><h3>${esc(scene.title)}</h3><p>${esc(scene.caption)}</p><span class="scene-footnote">${esc(scene.note ?? (event ? 'One event. The state it leaves behind.' : 'Follow the sequence. Inspect the evidence.'))}</span></div>
      <div class="scene-visual"><div class="scene-visual-label"><span>FULL CONNECTED FLOW</span><span>${event ? esc(event.id) : 'overview'}</span></div>
        <div class="presentation-map-scroll" tabindex="0" role="region" aria-label="Connected checkout flow; scroll to inspect the full canvas"><svg class="presentation-map" viewBox="0 0 1130 410" role="group" aria-label="${esc(doc.title)}: persistent connected flow">
          <defs><marker id="present-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M1 1 9 5 1 9" fill="none" stroke="var(--scene-accent)" stroke-width="1.5"/></marker></defs>
          ${channels.map(([id, item]) => `<path class="present-wire ${traversed.has(id) ? 'present-traversed' : ''}" data-channel="${esc(id)}" data-from="${esc(item.from)}" data-to="${esc(item.to)}" d="${link(item)}"/>`).join('')}
          <path class="present-current ${warning ? 'present-warning' : ''}" d="${link(current)}" data-event-id="${esc(event?.id ?? '')}" data-from="${esc(event?.from ?? '')}" data-to="${esc(event?.to ?? '')}" visibility="${event ? 'visible' : 'hidden'}" ${event?.id === 'deadline' ? '' : 'marker-end="url(#present-arrow)"'}/>
          <g class="present-step" transform="translate(${(x1 + x2) / 2} ${(y1 + y2) / 2})" visibility="${event ? 'visible' : 'hidden'}"><circle r="12"/><text text-anchor="middle" y="5">${step}</text></g>
          ${locations.map(position => {
            const item = components.get(position.id), symbol = doc.presentation.symbols[item.id], active = event && [event.from, event.to].includes(item.id);
            return `<g class="present-node ${active ? 'present-active' : ''} ${selected === item.id ? 'present-selected' : ''}" transform="translate(${position.x} ${position.y})" data-select="${esc(item.id)}" role="button" tabindex="0" aria-label="Inspect ${esc(item.name)}" aria-pressed="${selected === item.id}"><rect class="present-hit" x="-105" y="-66" width="210" height="146" rx="8"/><g class="present-symbol symbol-${esc(symbol)}">${presentationSymbols[symbol]}</g><text class="present-node-name" x="0" y="78" text-anchor="middle">${esc(item.name)}</text></g>`;
          }).join('')}
        </svg></div><p class="persistent-map-hint">Scroll to follow the connected flow →</p>
        <div class="presentation-message"><span>${event ? `${esc(source.name)} → ${esc(target.name)}` : 'Reservation → payment → order'}</span><strong>${esc(scene.message ?? event?.label ?? 'Follow the purchase')}</strong></div>
      </div>
    </div>
    <div class="presentation-evidence ${warning ? 'scene-warning' : ''}"><span class="evidence-label">${evidence.length ? 'RECORD EVIDENCE' : 'THE QUESTION'}<small>${evidence.length ? 'AT THIS EVENT' : 'BEFORE WE START'}</small></span><div class="presentation-records" aria-label="Canonical record state">${evidence.length ? evidence.map(table => {
      const value = recordSummary(state.records[table.id]), changed = JSON.stringify(state.records[table.id]) !== JSON.stringify(previous.records[table.id]);
      return `<button class="present-record ${changed ? 'record-changed' : ''}" data-select="${esc(table.id)}" aria-label="Inspect ${esc(table.name)} record"><span>${esc(table.name)}</span><strong data-present-record="${esc(table.id)}">${esc(value).replaceAll('_', '_<wbr>')}</strong><small>${changed ? 'CHANGED' : 'UNCHANGED'}</small></button>`;
    }).join('') : `<p class="presentation-question">${esc(scene.question ?? 'What evidence supports the final outcome?')}</p>`}</div></div>
    ${selectedItem ? `<div class="presentation-inspect"><strong>${esc(selectedItem.name)}</strong><span>${esc(selectedItem.description)}</span><button data-action="presentation">Explore details ↗</button><button data-action="clear" aria-label="Clear presentation selection">×</button></div>` : ''}
    <nav class="presentation-scenes" aria-label="Flow steps"><button data-seek="0" aria-label="Walkthrough introduction" aria-current="${step === 0 ? 'step' : 'false'}">Intro</button>${scenario.presentation.scenes.map((item, index) => `<button data-seek="${index + 1}" aria-label="Step ${index + 1}: ${esc(item.title)}" aria-current="${step === index + 1 ? 'step' : 'false'}" title="${esc(item.title)}">${String(index + 1).padStart(2, '0')}</button>`).join('')}<span>${end ? esc(scenario.outcome) : 'Choose a step or press play'}</span></nav>`;
}
