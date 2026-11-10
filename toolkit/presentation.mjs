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

/** Scene composition changes deliberately; event identity and record state never do. */
export function presentationMarkup(doc, scenarioId, step, selected, reducedMotion = false, compact = false) {
  const esc = presentEscape, scenario = doc.scenarios[scenarioId];
  const state = snapshot(doc, scenarioId, step), previous = snapshot(doc, scenarioId, Math.max(0, step - 1));
  const event = state.event, scene = step ? scenario.presentation.scenes[step - 1] : scenario.presentation.intro;
  const warning = event?.tone === 'warning', end = step === scenario.events.length;
  const ids = event ? [...new Set([event.from, event.to])] : doc.presentation.overview;
  const width = compact ? 360 : 760, height = compact ? ids.length === 3 ? 540 : 380 : 350;
  const locations = ids.map((id, index) => ({ id, x: compact ? 180 : ids.length === 3 ? 135 + index * 245 : 135 + index * 490, y: compact ? 80 + index * 170 : 158 }));
  const components = new Map(doc.components.map(item => [item.id, item]));
  const evidence = (scene.evidence ?? []).map(id => doc.tables.find(table => table.id === id));
  const source = event ? components.get(event.from) : null, target = event ? components.get(event.to) : null;
  const link = (a, b) => compact ? `M${a.x},${a.y + 80} L${b.x},${b.y - 58}` : `M${a.x + 64},${a.y} L${b.x - 64},${b.y}`;
  const selectedItem = components.get(selected) ?? doc.tables.find(item => item.id === selected);
  return `<div class="presentation-heading"><span class="presentation-series">SOFTWARE ANATOMY <span>/</span> ${esc(doc.title.toUpperCase())}</span><div class="presentation-scenarios" role="group" aria-label="Presentation scenario">${Object.entries(doc.scenarios).filter(([, item]) => item.presentation).map(([id, item]) => `<button data-scenario="${esc(id)}" aria-pressed="${id === scenarioId}">${esc(item.short ?? item.name)}</button>`).join('')}</div><span class="presentation-simulation">SIMULATED</span></div>
    <div class="presentation-scene ${warning ? 'scene-warning' : ''} ${end ? 'scene-ending' : ''}" data-scene="${esc(event?.id ?? 'intro')}">
      <div class="scene-copy"><span class="scene-number">${String(step).padStart(2, '0')}<span> / ${String(scenario.events.length).padStart(2, '0')}</span></span><h3>${esc(scene.title)}</h3><p>${esc(scene.caption)}</p><span class="scene-footnote">${esc(scene.note ?? (event ? 'One event. The state it leaves behind.' : 'Follow the sequence. Inspect the evidence.'))}</span></div>
      <div class="scene-visual"><div class="scene-visual-label"><span>${esc(scene.chapter ?? 'THE CHECKOUT')}</span><span>${event ? esc(event.id) : 'overview'}</span></div>
        <div class="presentation-map-scroll" tabindex="0" role="region" aria-label="Current scene diagram"><svg class="presentation-map" viewBox="0 0 ${width} ${height}" role="group" aria-label="${esc(doc.title)} scene: ${esc(event?.label ?? 'overview')}">
          <defs><marker id="present-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M1 1 9 5 1 9" fill="none" stroke="var(--scene-accent)" stroke-width="1.5"/></marker></defs>
          ${locations.slice(0, -1).map((position, index) => `<path class="${event ? 'present-current' : 'present-wire'} ${warning ? 'present-warning' : ''}" d="${link(position, locations[index + 1])}" ${event ? `data-event-id="${esc(event.id)}" data-from="${esc(event.from)}" data-to="${esc(event.to)}"` : ''} ${event?.id === 'deadline' ? '' : 'marker-end="url(#present-arrow)"'}/>`).join('')}
          ${!compact && event ? `<text class="present-action" x="380" y="135" text-anchor="middle">${esc(scene.message ?? event.label)}</text><text class="present-protocol" x="380" y="188" text-anchor="middle">${esc(scene.protocol ?? '')}</text>` : ''}
          ${locations.map(position => {
            const item = components.get(position.id), symbol = doc.presentation.symbols[item.id];
            return `<g class="present-node ${selected === item.id ? 'present-selected' : ''}" transform="translate(${position.x} ${position.y})" data-select="${esc(item.id)}" role="button" tabindex="0" aria-label="Inspect ${esc(item.name)}" aria-pressed="${selected === item.id}"><rect class="present-hit" x="-105" y="-66" width="210" height="146" rx="8"/><g class="present-symbol symbol-${esc(symbol)}">${presentationSymbols[symbol]}</g><text class="present-node-name" x="0" y="78" text-anchor="middle">${esc(item.name)}</text></g>`;
          }).join('')}
          ${!event && !compact ? '<text class="present-overview-label" x="135" y="282" text-anchor="middle">01 / RESERVE</text><text class="present-overview-label" x="380" y="282" text-anchor="middle">02 / CAPTURE</text><text class="present-overview-label" x="625" y="282" text-anchor="middle">03 / CONFIRM</text>' : ''}
        </svg></div>
        <div class="presentation-message"><span>${event ? `${esc(source.name)} → ${esc(target.name)}` : 'Reservation → payment → order'}</span><strong>${esc(scene.message ?? event?.label ?? 'Follow the purchase')}</strong></div>
      </div>
    </div>
    <div class="presentation-evidence ${warning ? 'scene-warning' : ''}"><span class="evidence-label">${evidence.length ? 'RECORD EVIDENCE' : 'THE QUESTION'}<small>${evidence.length ? 'AT THIS EVENT' : 'BEFORE WE START'}</small></span><div class="presentation-records" aria-label="Canonical record state">${evidence.length ? evidence.map(table => {
      const value = recordSummary(state.records[table.id]), changed = JSON.stringify(state.records[table.id]) !== JSON.stringify(previous.records[table.id]);
      return `<button class="present-record ${changed ? 'record-changed' : ''}" data-select="${esc(table.id)}" aria-label="Inspect ${esc(table.name)} record"><span>${esc(table.name)}</span><strong data-present-record="${esc(table.id)}">${esc(value).replaceAll('_', '_<wbr>')}</strong><small>${changed ? 'CHANGED' : 'UNCHANGED'}</small></button>`;
    }).join('') : `<p class="presentation-question">${esc(scene.question ?? 'What evidence supports the final outcome?')}</p>`}</div></div>
    ${selectedItem ? `<div class="presentation-inspect"><strong>${esc(selectedItem.name)}</strong><span>${esc(selectedItem.description)}</span><button data-action="presentation">Explore details ↗</button><button data-action="clear" aria-label="Clear presentation selection">×</button></div>` : ''}
    <nav class="presentation-scenes" aria-label="Presentation scenes"><button data-seek="0" aria-label="Walkthrough introduction" aria-current="${step === 0 ? 'step' : 'false'}">Intro</button>${scenario.presentation.scenes.map((item, index) => `<button data-seek="${index + 1}" aria-label="Scene ${index + 1}: ${esc(item.title)}" aria-current="${step === index + 1 ? 'step' : 'false'}" title="${esc(item.title)}">${String(index + 1).padStart(2, '0')}</button>`).join('')}<span>${end ? esc(scenario.outcome) : 'Choose a scene or press play'}</span></nav>`;
}
