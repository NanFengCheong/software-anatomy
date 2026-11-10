import { snapshot, validateDocument } from './model.mjs';

const relationKey = rel => `${rel.from}.${rel.field}->${rel.to}.${rel.targetField}`;

/** Authored panels project a canonical model; they never infer or drop phases. */
export function planPanels(doc, scenarioId, view) {
  validateDocument(doc);
  if (!Object.hasOwn(doc.scenarios, scenarioId)) throw new RangeError(`Unknown scenario: ${scenarioId}`);
  if (!['architecture', 'sequence', 'erd'].includes(view)) throw new RangeError(`Unknown panel view: ${view}`);
  const definitions = doc.panels?.[view];
  if (definitions === undefined) return [];
  if (!Array.isArray(definitions) || !definitions.length) throw new TypeError(`Invalid ${view} panels`);
  const events = doc.scenarios[scenarioId].events;
  const allComponents = new Set(doc.components.map(item => item.id));
  const allTables = new Set(doc.tables.map(item => item.id));
  const ids = new Set(), assignments = new Map();
  for (const panel of definitions) {
    if (!/^[a-z][a-z0-9_-]*$/.test(panel.id) || ids.has(panel.id) || typeof panel.name !== 'string' || !panel.name.trim()) throw new TypeError(`Duplicate or invalid ${view} panel: ${panel.id}`);
    ids.add(panel.id);
    const members = view === 'sequence' ? [panel.phase] : panel[view === 'architecture' ? 'components' : 'tables'];
    if (!Array.isArray(members) || !members.length) throw new TypeError(`Panel requires members: ${panel.id}`);
    for (const id of members) {
      if (typeof id !== 'string' || !id || assignments.has(id) || view === 'architecture' && !allComponents.has(id) || view === 'erd' && !allTables.has(id)) throw new TypeError(`Unknown or duplicate panel member: ${id}`);
      assignments.set(id, panel.id);
    }
  }
  const required = view === 'sequence' ? new Set(events.map(event => event.phase)) : view === 'architecture' ? allComponents : allTables;
  for (const id of required) if (!assignments.has(id)) throw new TypeError(`Unowned ${view} member: ${id}`);

  const plans = definitions.map(panel => {
    const primaryComponents = new Set(panel.components ?? []);
    const primaryTables = new Set(panel.tables ?? []);
    const panelEvents = events.filter(event => view === 'sequence' ? event.phase === panel.phase : view === 'architecture' ? primaryComponents.has(event.from) && primaryComponents.has(event.to) : Object.keys(event.writes ?? {}).some(id => primaryTables.has(id)));
    // Sequence phases can be absent from a scenario (e.g. reconciliation during
    // success). Do not create fake messages to make an empty phase render.
    if (!panelEvents.length && view === 'sequence') return null;
    if (!panelEvents.length) throw new TypeError(`Panel has no relevant scenario events: ${panel.id}`);
    const tables = new Set(primaryTables);
    if (view !== 'erd') for (const table of doc.tables) if (primaryComponents.has(table.owner)) tables.add(table.id);
    for (const event of panelEvents) for (const id of Object.keys(event.writes ?? {})) tables.add(id);
    // FK context is transitive: a visible child always includes its referenced
    // parent, while unchanged canonical records remain available via projection.
    let added;
    do {
      added = false;
      for (const rel of doc.relations) if (tables.has(rel.from) && !tables.has(rel.to)) { tables.add(rel.to); added = true; }
    } while (added);
    const components = new Set(primaryComponents);
    for (const event of panelEvents) { components.add(event.from); components.add(event.to); }
    for (const table of doc.tables) if (tables.has(table.id)) components.add(table.owner);
    const relations = doc.relations.filter(rel => tables.has(rel.from) && tables.has(rel.to));
    const eventSteps = panelEvents.map(event => events.indexOf(event) + 1);
    const document = {
      ...doc,
      title: `${doc.title} · ${panel.name}`,
      components: doc.components.filter(item => components.has(item.id)),
      tables: doc.tables.filter(item => tables.has(item.id)),
      relations,
      boundaries: (doc.boundaries ?? []).map(boundary => ({ ...boundary, members: boundary.members.filter(id => components.has(id)) })).filter(boundary => boundary.members.length),
      scenarios: { [scenarioId]: { ...doc.scenarios[scenarioId], events: panelEvents } }
    };
    delete document.panels;
    validateDocument(document);
    return {
      id: panel.id, name: panel.name, description: panel.description ?? '', view,
      document, eventSteps, eventIds: panelEvents.map(event => event.id),
      primaryIds: [...(view === 'erd' ? primaryTables : primaryComponents)],
      contextIds: view === 'erd' ? [...tables].filter(id => !primaryTables.has(id)) : [...components].filter(id => !primaryComponents.has(id)),
      relationIds: relations.map(relationKey), continuations: []
    };
  }).filter(Boolean);

  if (view === 'sequence') {
    const steps = plans.flatMap(panel => panel.eventSteps);
    if (steps.length !== events.length || steps.some((step, index) => step !== index + 1)) throw new TypeError('Sequence panels must partition events exactly once in canonical order');
    plans.forEach((panel, index) => {
      if (index > 0) {
        const previous = plans[index - 1], nextStep = panel.eventSteps[0], event = events[nextStep - 1];
        const link = { kind: 'phase', eventId: event.id, globalStep: nextStep, from: events[nextStep - 2].to, to: event.from, fromPanel: previous.id, toPanel: panel.id, label: `Continue at event ${nextStep}: ${event.label}` };
        previous.continuations.push(link); panel.continuations.push(link);
      }
    });
  } else if (view === 'architecture') {
    events.forEach((event, index) => {
      const fromPanel = assignments.get(event.from), toPanel = assignments.get(event.to);
      if (fromPanel === toPanel) return;
      const link = { kind: 'event', eventId: event.id, globalStep: index + 1, from: event.from, to: event.to, fromPanel, toPanel, label: event.label };
      for (const panel of plans) if (panel.id === fromPanel || panel.id === toPanel) panel.continuations.push(link);
    });
  } else {
    for (const rel of doc.relations) {
      const fromPanel = assignments.get(rel.from), toPanel = assignments.get(rel.to);
      if (fromPanel === toPanel) continue;
      const link = { kind: 'relation', relationId: relationKey(rel), from: rel.from, to: rel.to, field: rel.field, targetField: rel.targetField, fromPanel, toPanel, label: `${rel.from}.${rel.field} → ${rel.to}.${rel.targetField}` };
      for (const panel of plans) if (panel.id === fromPanel || panel.id === toPanel) panel.continuations.push(link);
    }
  }
  return plans;
}

/** Read global state, then project visible records and current local message. */
export function stateForPanel(doc, scenarioId, globalStep, panel) {
  const canonical = snapshot(doc, scenarioId, globalStep);
  const localIndex = panel.eventSteps.indexOf(globalStep);
  return {
    ...canonical,
    records: Object.fromEntries(panel.document.tables.map(table => [table.id, canonical.records[table.id]])),
    event: localIndex >= 0 ? canonical.event : null,
    step: localIndex >= 0 ? localIndex + 1 : panel.eventSteps.filter(step => step <= globalStep).length,
    globalStep,
    total: panel.eventSteps.length,
    // Consumers should use currentLocalStep rather than treating a previously
    // visited local message as current while the global event is another panel.
    currentLocalStep: localIndex >= 0 ? localIndex + 1 : null
  };
}
