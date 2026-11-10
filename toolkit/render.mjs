import { presentationMarkup } from './presentation.mjs';
import { validateDocument, snapshot, relatedIds, recordSummary } from './model.mjs';
import { renderPeleView } from './pele.mjs';
import { installTheme } from './theme.mjs';
import { createMediaFrames } from './exports.mjs';
import { svgBlob, svgToPng, framesToGif, downloadBlob } from './media.mjs';
import { planPanels } from './panels.mjs';

export const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const e = escapeHtml;
const statusTone = value => ['confirmed', 'captured', 'committed', 'processed', 'paid'].includes(value) ? 'good' : ['unknown', 'payment_pending'].includes(value) ? 'warn' : '';

/** Mount an offline document. Returns cleanup for embedding in another application. */
export function mountAnatomy(root, document, options = {}) {
  const doc = validateDocument(document);
  let scenarioId = Object.keys(doc.scenarios)[0];
  let presenting = options.presentation === true && !!doc.scenarios[scenarioId].presentation;
  let step = 0, view = 'architecture', selected = null, playing = false, timer = null, speed = 1;
  let panelId = planPanels(doc, scenarioId, view).length ? 'auto' : 'all', exportController = null;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const byId = id => doc.components.find(item => item.id === id) ?? doc.tables.find(item => item.id === id);
  root.innerHTML = `
    <a class="skip" href="#diagram-title">Skip to diagram</a>
    <header class="topbar"><a class="wordmark" href="#"><span class="brand-mark">s<span>a</span></span>software anatomy<span class="edition">/ LAB 001</span></a><div class="top-actions"><label class="theme-control"><span>Mode</span><select id="theme" aria-label="Color mode"><option value="auto">Auto</option><option value="light">Light</option><option value="dark">Dark</option></select></label>${doc.presentation ? '<button class="button presentation-toggle" data-action="presentation" aria-pressed="false">Present walkthrough</button>' : ''}<button class="button" data-action="open-export">Export image / GIF</button><button class="button export" data-action="export">Export HTML <span aria-hidden="true">↗</span></button></div></header>
    <main>
      <section class="intro"><div><div class="eyebrow">THE SOFTWARE, EXPLAINED.</div><h1>${e(doc.title)}<span class="title-dot">.</span></h1><p>${e(doc.subtitle)}</p></div><div class="example-meta"><span class="meta-number">01</span><span>COMMERCE SYSTEM<br><strong>Interactive walkthrough</strong></span></div></section>
      <section class="workbench" aria-label="Interactive software model">
        <section id="presentation-stage" aria-label="Presentation walkthrough" hidden></section><div class="bench-toolbar"><div class="tabs" role="tablist" aria-label="Diagram view">${[['architecture', 'Architecture', '◇'], ['sequence', 'Sequence', '⇢'], ['erd', 'Data model', '▦']].map(([id, label, icon]) => `<button role="tab" id="tab-${id}" aria-controls="diagram-panel" data-view="${id}"><span aria-hidden="true">${icon}</span> ${label}</button>`).join('')}</div><label class="scenario-label">SCENARIO <select id="scenario" aria-label="Scenario">${Object.entries(doc.scenarios).map(([id, scenario]) => `<option value="${e(id)}">${e(scenario.name)}</option>`).join('')}</select></label></div>
        <div class="bench-body"><section class="diagram-section" id="diagram-panel" role="tabpanel"><div class="diagram-heading"><div><span class="eyebrow" id="view-kicker"></span><h2 id="diagram-title" tabindex="-1"></h2></div><div class="diagram-options"><label class="theme-control diagram-theme"><span>Diagram theme</span><select id="palette" aria-label="Diagram theme"><option value="neutral">Neutral</option><option value="ocean">Ocean</option><option value="forest">Forest</option></select></label><span class="simulation-pill">SIMULATED</span></div></div><div class="canvas-scroll"><div id="diagram"></div></div><div class="diagram-legend"><span><i class="legend-dot active-dot"></i> Current event</span><span><i class="legend-dot selected-dot"></i> Selected component</span><span class="diagram-hint">Select a component to inspect ↗</span></div></section>
        <aside class="inspector" aria-label="Component inspector"><div class="inspector-top"><span class="eyebrow">INSPECTOR</span><button class="icon-button" data-action="clear" aria-label="Clear selection">×</button></div><div id="inspector-content"></div></aside></div>
        <section id="panel-navigation" class="panel-navigation" aria-label="Diagram panels" hidden><label>DETAIL PANEL <select id="panel" aria-label="Detail panel"></select></label><p id="panel-description"></p><div id="continuations"></div></section>
        <section class="playback" aria-label="Playback controls"><div class="transport"><button class="icon-button" data-action="reset" aria-label="Reset playback" title="Reset (R)">↺</button><button class="icon-button" data-action="previous" aria-label="Previous event" title="Previous event (←)">|‹</button><button class="play-button" data-action="play" aria-label="Play scenario"><span id="play-icon" aria-hidden="true">▶</span></button><button class="icon-button" data-action="next" aria-label="Next event" title="Next event (→)">›|</button></div><div class="scrubber"><div class="scrubber-label"><label for="timeline">EVENT <span id="step-label"></span></label><span id="elapsed"></span></div><input id="timeline" aria-label="Playback position" type="range" min="0" value="0" step="1"></div><label class="speed-control"><span class="sr-only">Playback speed</span><select id="speed" aria-label="Playback speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label></section>
      </section>
      <section class="evidence-grid"><article class="event-card"><div class="section-label"><span class="eyebrow">EVENT STREAM</span><span id="run-state" class="run-state">READY</span></div><div id="current-event"></div><div class="event-dots" id="event-dots" aria-label="Jump to event"></div><p class="keyboard-hint"><kbd>Space</kbd> play / pause <kbd>←</kbd><kbd>→</kbd> step <kbd>R</kbd> reset <span>• Paced replay; times are illustrative.</span></p></article><article class="records-card"><div class="section-label"><span class="eyebrow">RECORD SNAPSHOTS</span><span class="tiny-label">AT THIS EVENT</span></div><div id="records"></div></article></section>
      <footer><span><strong>One model.</strong> Connected perspectives.</span><span>${e(doc.description)}</span></footer>
    </main><dialog id="export-dialog" aria-labelledby="export-title"><div class="export-heading"><h2 id="export-title">Export for the destination</h2><button class="icon-button" data-action="close-export" aria-label="Close export">×</button></div><p class="export-intro">Uses the current view, selection and resolved theme. GIF presets replay one scenario with fixed geometry.</p><form id="export-form"><div class="export-fields"><label>Format<select id="export-format" aria-label="Export format"><option value="svg">SVG</option><option value="png">PNG (2×)</option><option value="gif">GIF walkthrough</option></select></label><label>Composition<select id="export-composition" aria-label="Export composition"><option value="card">Explanation card</option><option value="diagram">Diagram</option></select></label><label>Destination<select id="export-target" aria-label="Export destination"><option value="document">Document</option><option value="slide">Slide</option></select></label><label>Usable width (CSS px)<input id="export-width" aria-label="Export width" type="number" min="320" max="1600" step="1" value="650" required></label><label id="export-preset-label" hidden>GIF scenario<select id="export-preset" aria-label="GIF scenario">${Object.entries(doc.scenarios).map(([id, item]) => `<option value="${e(id)}">${e(item.name)}</option>`).join('')}</select></label></div><p id="export-context" class="export-context"></p><p id="export-progress" role="status" aria-live="polite"></p><div class="export-actions"><button type="button" class="button" data-action="cancel-encoding" hidden>Cancel encoding</button><button type="submit" class="button export-submit">Download</button></div></form></dialog><div id="announcement" class="sr-only" aria-live="polite" aria-atomic="true"></div>`;
  const $ = selector => root.querySelector(selector);
  const theme = installTheme(root, $('#theme'), { initial: options.theme, palette: options.palette, paletteSelect: $('#palette'), diagrams: [$('.canvas-scroll'), $('.diagram-legend')] });
  $('#export-dialog').addEventListener('cancel', () => exportController?.abort());
  const panelsFor = () => planPanels(doc, scenarioId, view);
  const currentPanel = () => panelId === 'auto' ? panelsFor().find(panel => panel.eventSteps.includes(Math.max(1, step))) ?? panelsFor().find(panel => panel.continuations.some(link => link.globalStep === step && link.fromPanel === panel.id)) ?? panelsFor()[0] : panelsFor().find(panel => panel.id === panelId);
  function stop() { playing = false; clearTimeout(timer); timer = null; }
  function schedule() {
    clearTimeout(timer);
    if (playing) timer = setTimeout(() => { step++; if (step >= doc.scenarios[scenarioId].events.length) stop(); render(); schedule(); }, (presenting ? step ? doc.scenarios[scenarioId].presentation.scenes[step - 1].duration : 3000 : 1400) / speed);
  }
  function render() {
    const scenario = doc.scenarios[scenarioId], state = snapshot(doc, scenarioId, step);
    root.classList.toggle('is-presenting', presenting);
    $('#presentation-stage').hidden = !presenting;
    $('.skip').href = presenting ? '#presentation-stage' : '#diagram-title';
    $('.skip').textContent = presenting ? 'Skip to presentation' : 'Skip to diagram';
    $('#presentation-stage').tabIndex = -1;
    if (presenting) {
      const focusedPresentation = $('#presentation-stage').contains(window.document.activeElement) ? window.document.activeElement : null;
      const focusSelector = focusedPresentation?.dataset.select ? `[data-select="${CSS.escape(focusedPresentation.dataset.select)}"]` : focusedPresentation?.dataset.seek !== undefined ? `[data-seek="${focusedPresentation.dataset.seek}"]` : focusedPresentation?.dataset.scenario ? `[data-scenario="${CSS.escape(focusedPresentation.dataset.scenario)}"]` : focusedPresentation?.classList.contains('presentation-map-scroll') ? '.presentation-map-scroll' : null;
      const scrollLeft = $('.presentation-map-scroll')?.scrollLeft ?? 0;
      $('#presentation-stage').innerHTML = presentationMarkup(doc, scenarioId, step, selected, motion.matches, root.clientWidth < 700);
      $('.presentation-map-scroll').scrollLeft = scrollLeft;
      if (focusSelector) $('#presentation-stage').querySelector(focusSelector)?.focus({ preventScroll: true });
    }
    const presentationToggle = $('[data-action="presentation"]');
    if (presentationToggle) { presentationToggle.textContent = presenting ? 'Explore system ↗' : 'Present walkthrough'; presentationToggle.setAttribute('aria-pressed', presenting); presentationToggle.disabled = !scenario.presentation; }
    const event = state.event, focus = selected ? relatedIds(doc, selected) : new Set();
    const active = new Set(event ? [event.from, event.to, ...Object.keys(event.writes ?? {})] : []);
    const descriptions = { architecture: ['01 / SYSTEM STRUCTURE', 'Services & responsibilities'], sequence: ['02 / REQUEST LIFECYCLE', 'Messages, in order'], erd: ['03 / PERSISTENCE MODEL', 'Relationships & record state'] };
    $('#view-kicker').textContent = descriptions[view][0];
    $('#diagram-title').textContent = descriptions[view][1];
    $('#diagram-panel').setAttribute('aria-labelledby', `tab-${view}`);
    for (const tab of root.querySelectorAll('[data-view]')) { const on = tab.dataset.view === view; tab.setAttribute('aria-selected', on); tab.tabIndex = on ? 0 : -1; }
    const focused = $('#diagram').contains(window.document.activeElement) ? window.document.activeElement.dataset : null;
    const panels = panelsFor();
    if (!['all', 'auto'].includes(panelId) && !panels.some(panel => panel.id === panelId)) panelId = 'all';
    const panel = currentPanel();
    $('#panel-navigation').hidden = panels.length === 0;
    $('#panel').innerHTML = `<option value="auto">Follow current phase</option><option value="all">Full system</option>${panels.map(item => `<option value="${e(item.id)}">${e(item.name)}</option>`).join('')}`;
    $('#panel').value = panelId;
    $('#panel-description').textContent = panel ? panel.description + (state.event && !panel.eventSteps.includes(step) ? ' Current event is outside this panel.' : '') : 'Full system; select a bounded panel for a readable document export.';
    $('#continuations').innerHTML = panel ? (panel.continuations ?? []).map(item => `<span class="continuation ${item.globalStep === step ? 'current-continuation' : ''}" data-continuation="${e(item.eventId ?? item.relationId)}">${e(item.fromPanel)} → ${e(item.toPanel)} · ${e(item.eventId ?? item.relationId)} · ${item.globalStep ? `event ${item.globalStep} · ` : ''}${e(item.from)} → ${e(item.to)} · ${e(item.label)}</span>`).join('') : '';
    try {
      renderPeleView($('#diagram'), panel?.document ?? doc, scenarioId, view, state, selected, active, focus, { eventSteps: panel?.eventSteps });
    } catch (error) {
      stop();
      const message = window.document.createElement('p');
      message.className = 'diagram-error'; message.setAttribute('role', 'alert');
      message.textContent = `Diagram could not be rendered: ${error.message}`;
      $('#diagram').replaceChildren(message);
    }
    if (focused?.select) root.querySelector(`[data-select="${CSS.escape(focused.select)}"]`)?.focus();
    else if (focused?.seek) root.querySelector(`#diagram [data-seek="${CSS.escape(focused.seek)}"]`)?.focus();
    $('#timeline').max = scenario.events.length;
    $('#timeline').value = step;
    $('#timeline').style.setProperty('--progress', `${step / scenario.events.length * 100}%`);
    $('#timeline').setAttribute('aria-valuetext', `${step} of ${scenario.events.length}: ${event?.label ?? 'Ready'}`);
    $('#step-label').textContent = `${String(step).padStart(2, '0')} / ${String(scenario.events.length).padStart(2, '0')}`;
    $('#elapsed').textContent = `${((event?.at ?? 0) / 1000).toFixed(3)} s`;
    $('[data-action="play"]').setAttribute('aria-label', playing ? 'Pause scenario' : step === scenario.events.length ? 'Replay scenario' : 'Play scenario');
    $('#play-icon').textContent = playing ? 'Ⅱ' : '▶';
    $('[data-action="previous"]').disabled = step === 0;
    $('[data-action="next"]').disabled = step === scenario.events.length;
    $('#run-state').textContent = playing ? 'PLAYING' : step === scenario.events.length ? 'COMPLETE' : step ? 'PAUSED' : 'READY';
    $('#current-event').innerHTML = `<h3>${event ? e(event.label) : 'Ready when you are.'}</h3><p>${e(event?.detail ?? scenario.description)}</p>${step === scenario.events.length ? `<div class="outcome ${scenario.events.some(item => item.tone === 'warning') ? 'warn' : 'good'}">${e(scenario.outcome)}</div>` : ''}`;
    $('#event-dots').innerHTML = scenario.events.map((item, index) => `<button class="event-dot ${index < step ? 'done' : ''} ${index === step - 1 ? 'current' : ''}" data-seek="${index + 1}" aria-label="Jump to event ${index + 1}: ${e(item.label)}" aria-pressed="${index === step - 1}" title="${e(item.label)}">${String(index + 1).padStart(2, '0')}</button>`).join('');
    $('#records').innerHTML = doc.tables.map(table => { const value = recordSummary(state.records[table.id]); return `<button class="record-row ${focus.has(table.id) ? 'record-selected' : ''}" data-select="${e(table.id)}" aria-label="Inspect ${e(table.name)} record"><span>${e(table.name)}</span><span class="status ${statusTone(value)}" data-record="${e(table.id)}">${e(value)}</span></button>`; }).join('');
    const item = selected ? byId(selected) : null;
    if (item) {
      const tables = doc.tables.filter(table => focus.has(table.id));
      $('#inspector-content').innerHTML = `<div class="inspector-icon">${e(item.icon ?? '▦')}</div><span class="tiny-label">${item.owner ? 'DATA ENTITY' : e(item.kind)}</span><h3>${e(item.name)}</h3><p>${e(item.description)}</p><div class="inspector-divider"></div><span class="eyebrow">CONNECTED RECORDS</span>${tables.length ? tables.map(table => `<section class="inspector-record"><h4>${e(table.name)}</h4>${Object.keys(state.records[table.id]).length ? `<dl>${Object.entries(state.records[table.id]).map(([key, value]) => `<div><dt>${e(key)}</dt><dd>${e(value ?? 'null')}</dd></div>`).join('')}</dl>` : '<p class="muted">Not created at this event.</p>'}</section>`).join('') : '<p class="muted">No owned records in this example.</p>'}<div class="selection-note">Selection follows you across all three views.</div>`;
    } else {
      $('#inspector-content').innerHTML = `<div class="empty-orbit"><span>◇</span><i></i><b>↗</b></div><h3>Look a little closer.</h3><p>Select a service, message participant, or table to see its role and connected records.</p><div class="inspector-divider"></div><span class="eyebrow">IN THIS EXAMPLE</span><div class="scope-stats"><span><strong>${doc.components.length}</strong> components</span><span><strong>${doc.tables.length}</strong> record types</span><span><strong>${Object.keys(doc.scenarios).length}</strong> scenarios</span></div><div class="selection-note">All views share the same scenario and event position.</div>`;
    }
    $('#announcement').textContent = `${scenario.name}. Event ${step} of ${scenario.events.length}. ${event?.label ?? 'Ready.'}${step === scenario.events.length ? ` ${scenario.outcome}.` : ''}`;
    root.dataset.scenario = scenarioId; root.dataset.step = step; root.dataset.view = view; root.dataset.selection = selected ?? ''; root.dataset.panel = panelId; root.dataset.presentation = String(presenting);
  }
  function seek(value) { stop(); step = Math.max(0, Math.min(doc.scenarios[scenarioId].events.length, value)); render(); }
  function changeView(value) { view = value; panelId = panelsFor().length ? 'auto' : 'all'; render(); }
  function click(event) {
    const target = event.target.closest('[data-action], [data-view], [data-select], [data-seek], [data-scenario]');
    if (!target || target === root || !root.contains(target)) return;
    if (target.dataset.scenario) { stop(); scenarioId = target.dataset.scenario; step = 0; selected = null; panelId = panelsFor().length ? 'auto' : 'all'; render(); return; }
    if (target.dataset.view) return changeView(target.dataset.view);
    if (target.dataset.select) { selected = target.dataset.select; render(); return; }
    if (target.dataset.seek !== undefined) return seek(Number(target.dataset.seek));
    switch (target.dataset.action) {
      case 'presentation': stop(); presenting = !presenting; render(); $('[data-action="presentation"]').focus({ preventScroll: true }); break;
      case 'clear': selected = null; render(); break;
      case 'reset': seek(0); break;
      case 'previous': seek(step - 1); break;
      case 'next': seek(step + 1); break;
      case 'play':
        if (playing) stop(); else { if (step === doc.scenarios[scenarioId].events.length) step = 0; playing = true; }
        render(); schedule(); break;
      case 'export': {
        const exportedDocument = window.document.documentElement.cloneNode(true);
        exportedDocument.querySelector('body').dataset.startPresentation = String(presenting);
        const html = options.exportHtml?.() ?? '<!doctype html>\n' + exportedDocument.outerHTML;
        const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
        const link = window.document.createElement('a'); link.href = url; link.download = 'software-anatomy.html'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000); break;
      }
      case 'open-export':
        stop(); render(); $('#export-preset').value = scenarioId; $('#export-progress').textContent = '';
        $('#export-context').textContent = `${view} · event ${step}/${doc.scenarios[scenarioId].events.length} · ${currentPanel()?.name ?? 'full system'} · ${theme.palette} / ${theme.resolved}`;
        $('#export-dialog').showModal(); break;
      case 'close-export': exportController?.abort(); $('#export-dialog').close(); break;
      case 'cancel-encoding': exportController?.abort(); break;
    }
  }
  function keydown(event) {
    const target = event.target;
    if (target.closest('[role="tab"]') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); const views = ['architecture', 'sequence', 'erd'];
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (views.indexOf(view) + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
      changeView(views[index]); $(`#tab-${view}`).focus(); return;
    }
    if (event.key === 'Escape' && presenting) { stop(); presenting = false; render(); $('[data-action="presentation"]').focus(); return; }
    if (target.closest('svg [role="button"]') && ['Enter', ' '].includes(event.key)) { event.preventDefault(); target.closest('[role="button"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); return; }
    if (target.closest('input, select, textarea, button, a, [contenteditable="true"]') || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === ' ') { event.preventDefault(); $('[data-action="play"]').click(); }
    if (event.key === 'ArrowRight') { event.preventDefault(); seek(step + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); seek(step - 1); }
    if (event.key.toLowerCase() === 'r') seek(0);
  }
  function change(event) {
    if (event.target.id === 'scenario') { stop(); scenarioId = event.target.value; if (!doc.scenarios[scenarioId].presentation) presenting = false; step = 0; panelId = panelsFor().length ? 'auto' : 'all'; render(); }
    if (event.target.id === 'speed') { speed = Number(event.target.value); schedule(); }
    if (event.target.id === 'panel') { panelId = event.target.value; render(); }
    if (event.target.id === 'export-format') { const gif = event.target.value === 'gif'; $('#export-preset-label').hidden = !gif; if (gif) { $('#export-width').value = '960'; $('#export-target').value = 'document'; } }
    if (event.target.id === 'export-target') $('#export-width').value = event.target.value === 'slide' ? '1120' : '650';
  }
  async function exportMedia(event) {
    if (event.target.id !== 'export-form') return;
    event.preventDefault();
    if (exportController) return;
    exportController = new AbortController();
    const button = $('.export-submit'); button.disabled = true; $('[data-action="cancel-encoding"]').hidden = false;
    try {
      const format = $('#export-format').value;
      const exportTheme = theme.resolved;
      const exportPalette = theme.palette;
      const exportScenario = format === 'gif' ? $('#export-preset').value : scenarioId;
      const panel = exportScenario === scenarioId ? currentPanel() : null;
      const count = doc.scenarios[exportScenario].events.length;
      const steps = format === 'gif' ? panel ? [Math.max(0, panel.eventSteps[0] - 1), ...panel.eventSteps] : Array.from({ length: count + 1 }, (_, index) => index) : [step];
      $('#export-progress').textContent = 'Preparing fixed layout…';
      await new Promise(resolve => setTimeout(resolve, 0));
      if (exportController.signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
      const frames = createMediaFrames(doc, { scenarioId: exportScenario, view, selected, panel, steps, width: Number($('#export-width').value), target: $('#export-target').value, ...( $('#export-target').value === 'slide' ? { height: 560 } : {}), composition: $('#export-composition').value, theme: exportTheme, palette: exportPalette });
      const blob = format === 'svg' ? svgBlob(frames[0].svg) : format === 'png' ? await svgToPng(frames[0].svg, { scale: 2, signal: exportController.signal }) : await framesToGif(frames, { signal: exportController.signal, onProgress: ({ completed, total }) => { const progress = $('#export-progress'); if (progress) progress.textContent = `Encoding ${completed}/${total} frames…`; } });
      if (exportController.signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
      downloadBlob(blob, `software-anatomy-${exportScenario}-${view}-${exportPalette}-${exportTheme}.${format}`);
      $('#export-progress').textContent = `Downloaded ${format.toUpperCase()} · ${frames[0].width} × ${frames[0].height} CSS px · ${(blob.size / 1024).toFixed(0)} KB · ${exportPalette} / ${exportTheme}`;
      root.dispatchEvent(new CustomEvent('anatomy:export', { detail: { format, frames: frames.length, width: frames[0].width, height: frames[0].height, theme: exportTheme, palette: exportPalette, scenario: exportScenario, bytes: blob.size } }));
    } catch (error) { const progress = $('#export-progress'); if (progress) progress.textContent = error.name === 'AbortError' ? 'Export cancelled.' : `Export failed: ${error.message}`; }
    finally { exportController = null; button.disabled = false; const cancel = $('[data-action="cancel-encoding"]'); if (cancel) cancel.hidden = true; }
  }
  function input(event) { if (event.target.id === 'timeline') seek(Number(event.target.value)); }
  function visibility() { if (window.document.hidden) { stop(); render(); } }
  function motionChanged() { root.classList.toggle('reduced-motion', motion.matches); if (presenting) render(); }
  let lastWidth = 0;
  const resize = new ResizeObserver(entries => {
    const width = entries[0].contentRect.width;
    if (Math.abs(width - lastWidth) > 1) { lastWidth = width; render(); }
  });
  resize.observe(root);
  root.addEventListener('click', click); root.addEventListener('keydown', keydown); root.addEventListener('change', change); root.addEventListener('input', input);
  root.addEventListener('submit', exportMedia);
  window.document.addEventListener('visibilitychange', visibility); motion.addEventListener('change', motionChanged);
  motionChanged(); render();
  return () => { stop(); exportController?.abort(); theme.destroy(); resize.disconnect(); root.removeEventListener('click', click); root.removeEventListener('keydown', keydown); root.removeEventListener('change', change); root.removeEventListener('input', input); root.removeEventListener('submit', exportMedia); window.document.removeEventListener('visibilitychange', visibility); motion.removeEventListener('change', motionChanged); root.replaceChildren(); };
}
