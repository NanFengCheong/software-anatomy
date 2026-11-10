/** A replayable document uses stable component/table IDs and explicit event writes. */
export function validateDocument(doc) {
  const fail = message => { throw new TypeError(message); };
  if (!doc || !Array.isArray(doc.components) || !doc.components.length || !Array.isArray(doc.tables) || !Array.isArray(doc.relations) || !doc.scenarios || typeof doc.scenarios !== 'object' || Array.isArray(doc.scenarios)) fail('Document requires components, tables, relations and scenarios');
  const ids = new Set();
  const label = value => typeof value === 'string' && value.length > 0;
  for (const item of [...doc.components, ...doc.tables]) {
    if (!label(item.id) || !/^[a-z][a-z0-9_-]*$/.test(item.id) || ['constructor', 'prototype', '__proto__'].includes(item.id) || ids.has(item.id)) fail(`Duplicate or invalid ID: ${item.id}`);
    if (!label(item.name)) fail(`Missing name: ${item.id}`);
    ids.add(item.id);
  }
  const components = new Set(doc.components.map(item => item.id));
  const tables = new Map(doc.tables.map(item => [item.id, item]));
  if (doc.presentation !== undefined) {
    const story = doc.presentation, symbols = ['window', 'receipt', 'stock', 'card', 'bank', 'clock'];
    if (!story || !story.symbols || typeof story.symbols !== 'object' || Array.isArray(story.symbols) || Object.keys(story.symbols).length !== components.size || [...components].some(id => !Object.hasOwn(story.symbols, id) || !symbols.includes(story.symbols[id]))) fail('Presentation requires a known symbol per component');
    if (!Array.isArray(story.layout) || story.layout.length !== components.size || new Set(story.layout.map(item => item?.id)).size !== components.size) fail('Presentation requires one layout position per component');
    for (const item of story.layout) {
      if (!components.has(item?.id) || !Number.isFinite(item.x) || !Number.isFinite(item.y) || item.x < 105 || item.x > 1025 || item.y < 54 || item.y > 250) fail('Invalid presentation layout');
    }
    for (const [index, item] of story.layout.entries()) {
      if (story.layout.slice(index + 1).some(other => Math.abs(item.x - other.x) < 210 && Math.abs(item.y - other.y) < 130)) fail('Overlapping presentation layout');
    }
  }
  const grouped = new Set();
  if (doc.boundaries !== undefined && !Array.isArray(doc.boundaries)) fail('Invalid boundaries');
  for (const boundary of doc.boundaries ?? []) {
    if (!label(boundary.name) || !Array.isArray(boundary.members)) fail('Boundary requires name and members');
    for (const id of boundary.members) {
      if (!components.has(id) || grouped.has(id)) fail(`Invalid or duplicate boundary member: ${id}`);
      grouped.add(id);
    }
  }
  for (const item of doc.components) {
    if (![item.x, item.y].every(Number.isFinite)) fail(`Invalid position: ${item.id}`);
  }
  for (const table of doc.tables) {
    if (!components.has(table.owner)) fail(`Unknown table owner: ${table.owner}`);
    if (!Array.isArray(table.fields) || !table.fields.every(field => label(field) && /^[a-z][a-z0-9_]*$/.test(field) && !['constructor', 'prototype', '__proto__'].includes(field)) || new Set(table.fields).size !== table.fields.length) fail(`Invalid fields: ${table.id}`);
    if (![table.x, table.y].every(Number.isFinite)) fail(`Invalid position: ${table.id}`);
  }
  for (const relation of doc.relations ?? []) {
    if (!tables.has(relation.from) || !tables.has(relation.to)) fail('Unknown relation table');
    if (!tables.get(relation.from).fields.includes(relation.field)) fail('Unknown foreign key field');
    if (!tables.get(relation.to).fields.includes(relation.targetField)) fail('Unknown referenced field');
  }
  if (!Object.keys(doc.scenarios).length) fail('At least one scenario required');
  for (const [key, scenario] of Object.entries(doc.scenarios)) {
    if (!/^[a-z][a-z0-9_-]*$/.test(key)) fail(`Invalid scenario ID: ${key}`);
    if (!label(scenario.name) || !Array.isArray(scenario.events) || !scenario.events.length) fail(`Invalid scenario: ${key}`);
    if (scenario.presentation !== undefined) {
      const story = scenario.presentation;
      if (!doc.presentation || !story?.intro || !label(story.intro.title) || !label(story.intro.caption) || !Array.isArray(story.scenes) || story.scenes.length !== scenario.events.length) fail(`Invalid presentation: ${key}`);
      const evidence = scene => Array.isArray(scene.evidence) && scene.evidence.length <= 3 && new Set(scene.evidence).size === scene.evidence.length && scene.evidence.every(id => tables.has(id));
      if (!evidence(story.intro)) fail(`Invalid presentation intro evidence: ${key}`);
      for (const [index, scene] of story.scenes.entries()) {
        if (scene?.eventId !== scenario.events[index]?.id || !label(scene?.title) || !label(scene?.caption) || !Number.isFinite(scene?.duration) || scene.duration < 1000 || scene.duration > 15000 || !evidence(scene) || ['chapter', 'message', 'protocol', 'note'].some(field => scene[field] !== undefined && !label(scene[field]))) fail(`Invalid presentation scene: ${key}/${index}`);
      }
    }
    const events = new Set();
    let time = -1;
    for (const event of scenario.events) {
      if (!label(event.id) || events.has(event.id)) fail(`Duplicate or missing event: ${event.id}`);
      events.add(event.id);
      if (!components.has(event.from) || !components.has(event.to)) fail(`Unknown event component: ${event.id}`);
      if (!Number.isFinite(event.at) || event.at < 0 || event.at < time) fail(`Invalid event time: ${event.id}`);
      if (!label(event.label) || !label(event.detail)) fail(`Missing event description: ${event.id}`);
      time = event.at;
      for (const [tableId, writes] of Object.entries(event.writes ?? {})) {
        if (!tables.has(tableId)) fail(`Unknown write table: ${tableId}`);
        if (!writes || typeof writes !== 'object' || Array.isArray(writes)) fail(`Invalid writes: ${tableId}`);
        for (const [field, value] of Object.entries(writes)) {
          if (!tables.get(tableId).fields.includes(field)) fail(`Unknown field: ${tableId}.${field}`);
          if (!['string', 'number', 'boolean'].includes(typeof value) && value !== null) fail(`Invalid value: ${tableId}.${field}`);
          if (typeof value === 'number' && !Number.isFinite(value)) fail(`Invalid number: ${tableId}.${field}`);
        }
      }
    }
  }
  return doc;
}

/** Replay starts from empty records, so seeking backwards cannot retain future writes. */
export function snapshot(doc, scenarioId, step) {
  if (!Object.hasOwn(doc.scenarios, scenarioId)) throw new RangeError(`Unknown scenario: ${scenarioId}`);
  const scenario = doc.scenarios[scenarioId];
  if (!Number.isInteger(step) || step < 0 || step > scenario.events.length) throw new RangeError('Step outside scenario');
  const records = Object.fromEntries(doc.tables.map(table => [table.id, {}]));
  for (const event of scenario.events.slice(0, step)) {
    for (const [table, writes] of Object.entries(event.writes ?? {})) Object.assign(records[table], writes);
  }
  return { records, event: scenario.events[step - 1] ?? null, step, total: scenario.events.length };
}

/** Tables and components share focus through table ownership, never matching display text. */
export function relatedIds(doc, id) {
  const table = doc.tables.find(item => item.id === id);
  const owner = table?.owner ?? id;
  return new Set([owner, ...doc.tables.filter(item => item.owner === owner).map(item => item.id)]);
}

/** Summarize a representative row without claiming it is absent when no status column exists. */
export function recordSummary(record) {
  if (!Object.keys(record).length) return 'not created';
  const statuses = Object.entries(record).filter(([key]) => key.endsWith('_status'));
  if (statuses.length) return statuses.map(([key, value]) => `${key.slice(0, -7)}: ${value}`).join(' · ');
  return Object.hasOwn(record, 'status') ? String(record.status) : 'created';
}
