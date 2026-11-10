// Optional real Chromium boundary check; no browser dependency added to the toolkit.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

const binary = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(path => path && existsSync(path));
if (!binary) throw new Error('Set CHROME_PATH to a Chromium executable.');
const profile = await mkdtemp(join(tmpdir(), 'software-anatomy-'));
const out = resolve('output');
await mkdir(out, { recursive: true });
const chrome = spawn(binary, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
let siteServer;
const checks = [], errors = [], externalRequests = [];
try {
  const port = await new Promise((done, fail) => {
    let log = '';
    const timer = setTimeout(() => fail(new Error('Chromium startup timeout')), 15000);
    chrome.once('error', fail);
    chrome.stderr.on('data', chunk => { log += chunk; const match = log.match(/DevTools listening on ws:\/\/[^:]+:(\d+)/); if (match) { clearTimeout(timer); done(Number(match[1])); } });
  });
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise((done, fail) => { socket.onopen = done; socket.onerror = fail; });
  let seq = 0;
  const pending = new Map();
  socket.onmessage = message => {
    const event = JSON.parse(message.data);
    if (event.id) { const waiter = pending.get(event.id); if (waiter) { clearTimeout(waiter.timer); pending.delete(event.id); event.error ? waiter.fail(new Error(event.error.message)) : waiter.done(event.result); } }
    if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.text + ': ' + (event.params.exceptionDetails.exception?.description ?? ''));
    if (event.method === 'Network.requestWillBeSent' && /^https?:/.test(event.params.request.url)) externalRequests.push(event.params.request.url);
  };
  function send(method, params = {}) {
    return new Promise((done, fail) => { const id = ++seq; const timer = setTimeout(() => { pending.delete(id); fail(new Error(`CDP timeout: ${method}`)); }, 10000); pending.set(id, { done, fail, timer }); socket.send(JSON.stringify({ id, method, params })); });
  }
  async function evaluate(expression) { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'Evaluation failed'); return result.result.value; }
  async function wait(expression) {
    const deadline = Date.now() + 10000;
    do { if (await evaluate(expression)) return; await new Promise(done => setTimeout(done, 40)); } while (Date.now() < deadline);
    throw new Error(`Browser condition failed: ${expression}`);
  }
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new MouseEvent('click', {bubbles:true}))`);
  const check = async (name, expression) => { assert.ok(await evaluate(expression), name); checks.push(name); };
  const labelFloor = `Math.min(...[...document.querySelectorAll('#diagram svg text')].filter(el => el.textContent.trim()).map(el => { const m = el.getScreenCTM(); return parseFloat(getComputedStyle(el).fontSize) * Math.hypot(m.a,m.b); })) >= 13.9`;
  async function screenshot(name) { const metrics = await send('Page.getLayoutMetrics'); const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: metrics.cssContentSize.width, height: metrics.cssContentSize.height, scale: 1 } }); await writeFile(join(out, name + '.png'), Buffer.from(shot.data, 'base64')); }
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: pathToFileURL(resolve('dist/checkout.html')).href });
  await wait(`document.querySelector('#app')?.dataset.step === '0'`);
  await check('architecture is rendered by bundled Pele from Mermaid', `document.querySelector('#diagram').dataset.renderer === 'pele' && document.querySelector('#diagram .pele-architecture') !== null && document.querySelector('#diagram .pele-service') !== null`);
  await check('desktop architecture labels meet 14px placement floor', labelFloor);
  await check('interactive architecture labels stay below section heading size', `(() => {
    const headingSize = parseFloat(getComputedStyle(document.querySelector('.diagram-heading h2')).fontSize);
    return [...document.querySelectorAll('#diagram svg text')].filter(el => el.textContent.trim()).every(el => {
      const m = el.getScreenCTM();
      return parseFloat(getComputedStyle(el).fontSize) * Math.hypot(m.a,m.b) < headingSize;
    });
  })()`);
  await screenshot('checkout-desktop');
  // The presentation is another projection of the same canonical replay.
  await click('[data-action="presentation"]');
  await check('presentation starts paused with accessible scene navigation', `document.querySelector('#app').dataset.presentation === 'true' && document.querySelector('#run-state').textContent === 'READY' && document.querySelector('.presentation-scenes [aria-current="step"]').dataset.seek === '0'`);
  const stageGeometry = await evaluate(`(() => {
    window.__canvas = document.querySelector('.presentation-map');
    window.__canvasNodes = [...document.querySelectorAll('.present-node')];
    window.__canvasWires = [...document.querySelectorAll('[data-channel]')];
    return JSON.stringify({ nodes:window.__canvasNodes.map(el=>[el.dataset.select,el.getAttribute('transform')]), wires:window.__canvasWires.map(el=>[el.dataset.channel,el.getAttribute('d')]) });
  })()`);
  await click('#presentation-stage [data-seek="6"]');
  await check('presentation webhook establishes captured state and exact endpoints', `document.querySelector('[data-present-record="payment_attempts"]').textContent === 'captured' && document.querySelector('.present-current').dataset.eventId === 'webhook' && document.querySelector('.present-current').dataset.from === 'provider' && document.querySelector('.present-current').dataset.to === 'payments-api'`);
  await check('presentation keeps the same SVG, all six nodes and five connected channels while highlighting two endpoints', `document.querySelector('.presentation-map') === window.__canvas && document.querySelectorAll('.present-node').length === 6 && document.querySelectorAll('[data-channel]').length === 5 && document.querySelectorAll('.present-active').length === 2 && window.__canvasNodes.every(el=>el.isConnected) && window.__canvasWires.every(el=>el.isConnected)`);
  await check('highlighting an event preserves the complete layout geometry', `JSON.stringify({nodes:[...document.querySelectorAll('.present-node')].map(el=>[el.dataset.select,el.getAttribute('transform')]),wires:[...document.querySelectorAll('[data-channel]')].map(el=>[el.dataset.channel,el.getAttribute('d')])}) === ${JSON.stringify(stageGeometry)}`);
  await check('presentation service labels meet 20px at placement size', `[...document.querySelectorAll('.present-node-name')].every(el=>{const m=el.getScreenCTM();return parseFloat(getComputedStyle(el).fontSize)*Math.hypot(m.a,m.b)>=19.99})`);
  await check('compact presentation keeps the full graph and evidence within 1000 desktop pixels', `document.querySelector('.presentation-map').getBoundingClientRect().height <= 341 && document.querySelector('.presentation-evidence').getBoundingClientRect().bottom <= 1000`);
  await screenshot('presentation-success-desktop');
  await click('#presentation-stage [data-seek="2"]');
  await check('presentation backward seek removes future payment and webhook writes', `document.querySelector('[data-present-record="payment_attempts"]') === null && document.querySelector('[data-present-record="webhook_events"]') === null && document.querySelector('[data-present-record="orders"]').textContent === 'pending'`);
  await evaluate(`document.querySelector('.present-node[data-select="inventory-api"]').focus()`);
  await send('Input.dispatchKeyEvent', { type:'keyDown',key:'Enter',code:'Enter' });
  await check('presentation nodes support keyboard selection and retain focus', `document.querySelector('#app').dataset.selection === 'inventory-api' && document.activeElement.dataset.select === 'inventory-api'`);
  await send('Input.dispatchKeyEvent', { type:'keyDown',key:'Escape',code:'Escape' });
  await check('Escape opens exploration at the same canonical step and selection', `document.querySelector('#app').dataset.presentation === 'false' && document.querySelector('#app').dataset.step === '2' && document.querySelector('#app').dataset.selection === 'inventory-api' && document.activeElement.dataset.action === 'presentation'`);
  await click('[data-action="presentation"]');
  await click('[data-scenario="timeout"]');
  await evaluate(`document.querySelector('#presentation-stage [data-seek="5"]').scrollIntoView({block:'center'})`);
  const stepPoint = await evaluate(`(() => {const r=document.querySelector('#presentation-stage [data-seek="5"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await check('persistent canvas step navigation is not covered by the transport', `document.elementFromPoint(${stepPoint.x},${stepPoint.y}).closest('[data-seek]')?.dataset.seek==='5'`);
  await send('Input.dispatchMouseEvent', {type:'mousePressed',...stepPoint,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent', {type:'mouseReleased',...stepPoint,button:'left',clickCount:1});
  await check('native pointer on step five selects unknown payment without replacing the canvas', `document.querySelector('#app').dataset.step==='5' && document.querySelector('[data-present-record="payment_attempts"]').textContent==='unknown' && document.querySelector('.presentation-map')===window.__canvas`);
  await evaluate(`window.scrollTo(0,0)`);
  await click('#presentation-stage [data-seek="8"]');
  await check('presentation timeout preserves unknown payment, pending order and held stock', `document.querySelector('[data-present-record="payment_attempts"]').textContent === 'unknown' && document.querySelector('[data-present-record="orders"]').textContent === 'payment_pending' && document.querySelector('[data-present-record="reservations"]').textContent === 'held' && document.querySelector('.scene-copy p').textContent.includes('before any lookup result')`);
  await send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await wait(`document.querySelector('.present-packet') === null`);
  await check('presentation reduced motion removes packet animation', `document.querySelector('.presentation-map animateMotion') === null`);
  await send('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true});
  await wait(`document.documentElement.scrollWidth <= 390`);
  await check('presentation mobile scrolls the same full canvas without shrinking labels', `document.documentElement.scrollWidth <= 390 && document.querySelector('.presentation-map').getAttribute('viewBox') === '0 0 1130 340' && document.querySelector('.presentation-map-scroll').scrollWidth > document.querySelector('.presentation-map-scroll').clientWidth && [...document.querySelectorAll('.present-node-name')].every(el=>{const m=el.getScreenCTM();return parseFloat(getComputedStyle(el).fontSize)*Math.hypot(m.a,m.b)>=19.99})`);
  await check('presentation transport remains visible in a short mobile viewport', `document.querySelector('.playback').getBoundingClientRect().bottom <= innerHeight + 1 && document.querySelector('.playback').getBoundingClientRect().top >= 0`);
  await check('mobile transport sits above the scene without covering its diagram', `document.querySelector('.playback').getBoundingClientRect().bottom <= document.querySelector('#presentation-stage').getBoundingClientRect().top + 1`);
  await evaluate(`document.querySelector('.presentation-map-scroll').scrollLeft=500`);
  await click('#presentation-stage [data-seek="7"]');
  await check('seeking preserves canvas identity and the manually chosen mobile viewport', `document.querySelector('.presentation-map')===window.__canvas && document.querySelector('.presentation-map-scroll').scrollLeft===500`);
  await click('#presentation-stage [data-seek="8"]');
  await evaluate(`document.querySelector('.presentation-map-scroll').scrollLeft=0`);
  await screenshot('presentation-timeout-mobile');
  await send('Emulation.setDeviceMetricsOverride', {width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await evaluate(`document.querySelector('#theme').value = 'dark'; document.querySelector('#theme').dispatchEvent(new Event('change',{bubbles:true}));`);
  await screenshot('presentation-timeout-dark');
  await evaluate(`document.querySelector('#theme').value = 'light'; document.querySelector('#theme').dispatchEvent(new Event('change',{bubbles:true}));`);
  await check('presentation supports explicit light mode', `getComputedStyle(document.querySelector('#presentation-stage')).getPropertyValue('--stage-bg').trim() === '#f5f2e9'`);
  await click('[data-scenario="success"]');
  await evaluate(`document.querySelector('#speed').value='2';document.querySelector('#speed').dispatchEvent(new Event('change',{bubbles:true}));`);
  await click('[data-action="play"]');
  for (let scene = 1; scene <= 9; scene++) await wait(`Number(document.querySelector('#app').dataset.step) >= ${scene}`);
  await check('automatic playback retains the SVG and every node', `document.querySelector('.presentation-map')===window.__canvas && window.__canvasNodes.every(el=>el.isConnected)`);
  await check('paced presentation playback completes success with consistent records', `document.querySelector('#run-state').textContent === 'COMPLETE' && document.querySelector('[data-present-record="orders"]').textContent === 'confirmed' && document.querySelector('[data-present-record="reservations"]').textContent === 'committed'`);
  await evaluate(`window.__presentationOriginalURL=URL.createObjectURL; URL.createObjectURL=blob=>{window.__presentationDownload=blob;return window.__presentationOriginalURL(blob)};`);
  await click('[data-action="export"]');
  await writeFile(join(out,'exported-presentation.html'),await evaluate(`window.__presentationDownload.text()`));
  await send('Page.navigate',{url:pathToFileURL(join(out,'exported-presentation.html')).href});
  await wait(`document.querySelector('#app')?.dataset.presentation === 'true'`);
  await check('exported presentation reopens offline on the stage, paused at introduction', `document.querySelector('#app').dataset.step === '0' && document.querySelector('#run-state').textContent === 'READY' && document.querySelector('.presentation-map') !== null`);
  await evaluate(`window.__persistentCanvas=document.querySelector('.presentation-map');window.__persistentNodes=[...document.querySelectorAll('.present-node')];window.__persistentWires=[...document.querySelectorAll('[data-channel]')];`);
  const persistentBounds = await evaluate(`JSON.stringify([...document.querySelectorAll('.present-node')].map(el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height]}))`);
  for (const scenarioId of ['success', 'timeout']) {
    await click(`[data-scenario="${scenarioId}"]`);
    const eventCount = scenarioId === 'success' ? 9 : 8;
    for (let scene = 1; scene <= eventCount; scene++) {
      await click(`#presentation-stage [data-seek="${scene}"]`);
      await check(`${scenarioId} scene ${scene} retains exact endpoint identities and legible symbols`, `(() => {
        const edge=document.querySelector('.present-current'), nodes=[...document.querySelectorAll('.present-node')];
        return document.querySelector('.presentation-map')===window.__persistentCanvas && window.__persistentNodes.every(el=>el.isConnected) && window.__persistentWires.every(el=>el.isConnected) && nodes.length===6 && JSON.stringify(nodes.map(el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height]})) === ${JSON.stringify(persistentBounds)} && document.querySelectorAll('.present-active').length===2 && nodes.some(el=>el.dataset.select===edge.dataset.from) && nodes.some(el=>el.dataset.select===edge.dataset.to) && nodes.every(el=>el.querySelector('.present-symbol').children.length>0) && [...document.querySelectorAll('.present-node-name')].every(el=>{const m=el.getScreenCTM();return parseFloat(getComputedStyle(el).fontSize)*Math.hypot(m.a,m.b)>=19.99});
      })()`);
      await screenshot(`presentation-${scenarioId}-scene-${scene}`);
    }
  }
  await click('[data-scenario="success"]');
  await click('[data-action="reset"]');
  await check('scenario changes and reset retain the same connected canvas', `document.querySelector('.presentation-map')===window.__persistentCanvas && window.__persistentNodes.every(el=>el.isConnected) && window.__persistentWires.every(el=>el.isConnected)`);
  await check('presentation reset clears all records' , `document.querySelectorAll('[data-present-record]').length === 0 && [...document.querySelectorAll('#records [data-record]')].every(el=>el.textContent==='not created')`);
  await click('[data-action="presentation"]');
  await evaluate(`document.querySelector('#speed').value='1';document.querySelector('#speed').dispatchEvent(new Event('change',{bubbles:true}));`);
  await send('Emulation.setEmulatedMedia', {features:[]});

  await click('[data-action="next"]');
  await check('next event creates order', `document.querySelector('[data-record="orders"]').textContent === 'pending'`);
  await click('[data-seek="9"]');
  await check('success confirms captured payment and committed inventory', `document.querySelector('[data-record="orders"]').textContent === 'confirmed' && document.querySelector('[data-record="payment_attempts"]').textContent === 'captured' && document.querySelector('[data-record="reservations"]').textContent === 'committed'`);
  await click('[data-select="payments-api"]'); await click('[data-view="sequence"]');
  await check('sequence uses Pele message IDs mapped to replay events', `document.querySelector('#diagram .pele-sequence') !== null && document.querySelectorAll('#diagram .pele-message[data-event-id]').length === 9 && document.querySelector('#diagram [data-event-id="webhook"]').dataset.seek === '6'`);
  await check('desktop sequence labels meet 14px placement floor', labelFloor);
  await check('component selection survives sequence switch', `document.querySelector('#diagram [data-select="payments-api"]').getAttribute('aria-pressed') === 'true' && document.querySelector('#app').dataset.step === '9'`);
  const message = await evaluate(`(() => { const rect = document.querySelector('#diagram [data-event-id="webhook"] .pele-edge-label').getBoundingClientRect(); return {x:rect.x + rect.width/2,y:rect.y + rect.height/2}; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...message, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...message, button: 'left', clickCount: 1 });
  await check('native pointer click on Pele message seeks exact event and record state', `document.querySelector('#app').dataset.step === '6' && document.querySelector('[data-record="payment_attempts"]').textContent === 'captured' && document.querySelector('[data-record="orders"]').textContent === 'payment_pending'`);
  await evaluate(`document.querySelector('#diagram [data-event-id="confirm"]').focus()`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter' });
  await check('Pele message keyboard activation seeks its mapped replay step', `document.querySelector('#app').dataset.step === '9' && document.activeElement.dataset.eventId === 'confirm'`);
  await screenshot('checkout-sequence'); await click('[data-view="erd"]');
  await check('ERD uses Pele entities with live record values', `document.querySelector('#diagram .pele-er') !== null && document.querySelector('#diagram [data-select="payment_attempts"]').textContent.includes('captured')`);
  await check('desktop ERD labels meet 14px placement floor', labelFloor);
  await check('component ownership highlights both payment entities', `document.querySelector('#diagram [data-select="payment_attempts"]').classList.contains('is-selected') && document.querySelector('#diagram [data-select="webhook_events"]').classList.contains('is-selected')`);
  await screenshot('checkout-erd');
  await click('[data-select="payment_attempts"]'); await click('[data-view="architecture"]');
  await check('entity selection maps back to owning service', `document.querySelector('#diagram [data-select="payments-api"]').classList.contains('is-selected')`);
  await evaluate(`const range = document.querySelector('#timeline'); range.value = '3'; range.dispatchEvent(new Event('input', {bubbles:true}));`);
  await check('scrubbing backwards removes future writes', `document.querySelector('[data-record="payment_attempts"]').textContent === 'initiated' && document.querySelector('[data-record="webhook_events"]').textContent === 'not created'`);
  await evaluate(`const select = document.querySelector('#scenario'); select.value = 'timeout'; select.dispatchEvent(new Event('change', {bubbles:true}));`);
  await check('switching scenario resets event and records', `document.querySelector('#app').dataset.step === '0' && [...document.querySelectorAll('[data-record]')].every(item => item.textContent === 'not created')`);
  await click('[data-seek="8"]');
  await check('timeout keeps unknown payment, pending order, held stock and no webhook', `document.querySelector('[data-record="orders"]').textContent === 'payment_pending' && document.querySelector('[data-record="payment_attempts"]').textContent === 'unknown' && document.querySelector('[data-record="reservations"]').textContent === 'held' && document.querySelector('[data-record="webhook_events"]').textContent === 'not created' && document.querySelector('#current-event').textContent.includes('Awaiting reconciliation')`);
  await click('[data-action="reset"]');
  await evaluate(`document.querySelector('#diagram-title').focus()`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight' });
  await check('keyboard arrow advances playback', `document.querySelector('#app').dataset.step === '1'`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'r', code: 'KeyR' });
  await check('keyboard R resets playback', `document.querySelector('#app').dataset.step === '0'`);
  await evaluate(`document.querySelector('#tab-architecture').focus()`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight' });
  await check('tab arrow changes view without advancing playback', `document.querySelector('#app').dataset.view === 'sequence' && document.activeElement.id === 'tab-sequence' && document.querySelector('#app').dataset.step === '0'`);
  await evaluate(`document.querySelector('#speed').value = '2'; document.querySelector('#speed').dispatchEvent(new Event('change', {bubbles:true}));`);
  await click('[data-action="play"]'); await wait(`Number(document.querySelector('#app').dataset.step) >= 1`);
  await click('[data-action="play"]');
  const paused = await evaluate(`document.querySelector('#app').dataset.step`);
  await new Promise(done => setTimeout(done, 850));
  await check('pause stops automatic advancement', `document.querySelector('#app').dataset.step === ${JSON.stringify(paused)} && document.querySelector('#run-state').textContent === 'PAUSED'`);
  await click('[data-action="play"]'); await wait(`document.querySelector('#app').dataset.step === '8'`);
  await check('automatic playback reaches timeout outcome', `document.querySelector('#run-state').textContent === 'COMPLETE' && document.querySelector('[data-action="play"]').getAttribute('aria-label') === 'Replay scenario'`);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await click('[data-view="architecture"]');
  await check('mobile contains diagram overflow inside canvas', `document.documentElement.scrollWidth <= 390 && document.querySelector('.canvas-scroll').scrollWidth > document.querySelector('.canvas-scroll').clientWidth`);
  await check('mobile architecture labels stay readable after resize', labelFloor);
  await check('reduced motion disables connector animation', `getComputedStyle(document.querySelector('.current-connector > path:not(.pele-marker)')).animationName === 'none'`);
  await screenshot('checkout-mobile');
  await click('[data-view="sequence"]');
  await check('mobile sequence labels stay readable', labelFloor);
  await click('[data-view="erd"]');
  await check('mobile ERD labels stay readable', labelFloor);
  // Capture the exact Blob supplied to the browser download, then reopen those bytes offline.
  await evaluate(`window.__originalCreateURL = URL.createObjectURL; URL.createObjectURL = blob => { window.__download = blob; return window.__originalCreateURL(blob); };`);
  await click('[data-action="export"]');
  const exported = await evaluate(`window.__download.text()`);
  await writeFile(join(out, 'exported-checkout.html'), exported);
  await send('Page.navigate', { url: pathToFileURL(join(out, 'exported-checkout.html')).href });
  await wait(`document.querySelector('#app')?.dataset.step === '0'`);
  await check('export includes working Pele runtime and architecture view', `document.querySelector('#diagram .pele-architecture') !== null`);
  await click('[data-seek="9"]');
  await check('downloaded HTML reopens offline and completes checkout', `document.querySelector('[data-record="orders"]').textContent === 'confirmed'`);
  await click('[data-view="sequence"]');
  await check('exported sequence retains interactive Pele message mapping', `document.querySelector('#diagram .pele-sequence') !== null && document.querySelector('#diagram [data-event-id="webhook"]').dataset.seek === '6'`);
  await click('[data-view="erd"]');
  await check('exported ERD retains captured payment record inspection', `document.querySelector('#diagram .pele-er') !== null && document.querySelector('#diagram [data-select="payment_attempts"]').textContent.includes('captured')`);
  const select = (selector, value) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await check('Theme and Mode controls stay named and visible on mobile', `(() => {
    const controls = [...document.querySelectorAll('.theme-control')];
    return controls.length === 2 && controls.every(el => el.querySelector('span').getBoundingClientRect().width > 0 && getComputedStyle(el.querySelector('span')).fontSize !== '0px') && document.documentElement.scrollWidth <= 390;
  })()`);
  await select('#theme', 'auto');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await wait(`document.documentElement.dataset.resolvedTheme === 'dark'`);
  await check('Auto theme follows dark system preference', `document.querySelector('#theme').value === 'auto' && document.documentElement.dataset.resolvedTheme === 'dark'`);
  await select('#theme', 'light');
  await check('Light override stays light under dark system preference', `document.documentElement.dataset.resolvedTheme === 'light' && getComputedStyle(document.body).color === 'rgb(24, 24, 27)'`);
  await select('#theme', 'dark');
  await check('Neutral is the default palette and Dark uses charcoal surfaces', `document.querySelector('#palette').value === 'neutral' && document.documentElement.dataset.theme === 'dark' && getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() === '#18181b'`);
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await click('[data-view="sequence"]');
  await screenshot('checkout-dark');
  await evaluate(`window.__pageColors = ['.topbar','.inspector','.playback'].map(selector => { const el = document.querySelector(selector);const css = getComputedStyle(el);return [css.backgroundColor,css.color]; });`);
  await select('#palette', 'forest');
  await check('Forest changes the diagram without changing page mode or replay state', `document.documentElement.dataset.palette === 'forest' && document.documentElement.dataset.theme === 'dark' && document.querySelector('#app').dataset.step === '9' && getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() === '#18181b' && getComputedStyle(document.querySelector('#diagram')).getPropertyValue('--pele-bg').trim() === '#151e1a'`);
  await select('#palette', 'ocean');
  await check('Ocean updates only diagram tokens and persists independently', `document.documentElement.dataset.palette === 'ocean' && localStorage.getItem('software-anatomy-palette') === 'ocean' && getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() === '#18181b' && getComputedStyle(document.querySelector('#diagram')).getPropertyValue('--pele-bg').trim() === '#121f30'`);
  await check('Diagram theme selector is beside the diagram and leaves page surfaces unchanged', `document.querySelector('.diagram-heading #palette') !== null && JSON.stringify(window.__pageColors) === JSON.stringify(['.topbar','.inspector','.playback'].map(selector => { const css=getComputedStyle(document.querySelector(selector));return [css.backgroundColor,css.color]; }))`);
  await screenshot('checkout-ocean-dark');
  await evaluate(`window.__mediaDownloads=[];window.__mediaReports=[];document.querySelector('#app').addEventListener('anatomy:export',event=>window.__mediaReports.push(event.detail));document.addEventListener('click',event=>{const link=event.target.closest('a[download]');if(!link)return;event.preventDefault();const entry={name:link.download};window.__mediaDownloads.push(entry);fetch(link.href).then(response=>response.blob()).then(blob=>{entry.type=blob.type;entry.size=blob.size;const reader=new FileReader();reader.onload=()=>{entry.base64=reader.result.split(',')[1];};reader.readAsDataURL(blob);});},true);`);
  async function exportThroughUI({ format, composition = 'card', width = 650, preset = 'success', name, changeSystemDuringEncoding = false }) {
    const before = await evaluate('window.__mediaDownloads.length');
    await click('[data-action="open-export"]');
    await select('#export-format', format); await select('#export-composition', composition); await select('#export-target', 'document');
    await evaluate(`document.querySelector('#export-width').value=${width}`);
    if (format === 'gif') await select('#export-preset', preset);
    await click('.export-submit');
    if (changeSystemDuringEncoding) {
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
      await select('#palette', 'neutral');
    }
    await wait(`document.querySelector('#export-progress').textContent.includes('Downloaded') || document.querySelector('#export-progress').textContent.includes('failed')`);
    const status = await evaluate(`document.querySelector('#export-progress').textContent`);
    assert.ok(status.startsWith('Downloaded'), status);
    await wait(`window.__mediaDownloads[${before}]?.base64`);
    const download = await evaluate(`window.__mediaDownloads[${before}]`);
    const report = await evaluate('window.__mediaReports.at(-1)');
    const path = join(out, name);
    await writeFile(path, Buffer.from(download.base64, 'base64'));
    await click('[data-action="close-export"]');
    return { path, report, download };
  }
  const svgExport = await exportThroughUI({ format: 'svg', name: 'checkout-dark-card.svg', width: 650 });
  await check('SVG download preserves current theme and canonical record states', `window.__mediaReports.at(-1).format === 'svg' && window.__mediaReports.at(-1).theme === 'dark'`);
  const exportedSvg = await readFile(svgExport.path, 'utf8');
  assert.ok(exportedSvg.includes('#121f30') && exportedSvg.includes('captured') && exportedSvg.includes('confirmed'));
  assert.equal(svgExport.report.palette, 'ocean');
  await evaluate(`(() => { const fixture=document.createElement('div');fixture.id='export-measure';fixture.style.cssText='position:absolute;left:-10000px;top:0';fixture.innerHTML=${JSON.stringify(exportedSvg)};document.body.append(fixture); })()`);
  await check('exported card places caption below the actual decoded SVG viewport', `(() => { const fixture=document.querySelector('#export-measure');const diagram=fixture.querySelector('svg svg');const caption=fixture.querySelector('[data-export-caption]');return diagram.getBoundingClientRect().bottom < caption.getBoundingClientRect().top; })()`);
  await evaluate(`document.querySelector('#export-measure').remove()`);
  const pngExport = await exportThroughUI({ format: 'png', name: 'checkout-dark-card.png', width: 650 });
  const pngBytes = await readFile(pngExport.path);
  assert.deepEqual([...pngBytes.subarray(0,8)], [137,80,78,71,13,10,26,10]);
  assert.equal(pngBytes.readUInt32BE(16), pngExport.report.width * 2);
  assert.equal(pngBytes.readUInt32BE(20), pngExport.report.height * 2);
  checks.push('PNG download decodes at 2x exact CSS placement dimensions');
  await select('#theme', 'light');
  await select('#palette', 'neutral');
  const successGif = await exportThroughUI({ format: 'gif', preset: 'success', name: 'checkout-success-light.gif', width: 960 });
  await select('#theme', 'auto');
  await select('#palette', 'ocean');
  const timeoutGif = await exportThroughUI({ format: 'gif', preset: 'timeout', name: 'checkout-timeout-dark.gif', width: 960, changeSystemDuringEncoding: true });
  await check('Mode and palette can change during encoding while GIF retains captured Ocean Dark', `document.documentElement.dataset.resolvedTheme === 'light' && document.documentElement.dataset.palette === 'neutral' && window.__mediaReports.at(-1).theme === 'dark' && window.__mediaReports.at(-1).palette === 'ocean'`);
  for (const [file, expected] of [[successGif,10],[timeoutGif,9]]) {
    const stream = JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_entries','stream=width,height,nb_read_frames','-of','json',file.path],{encoding:'utf8'})).streams[0];
    assert.equal(Number(stream.nb_read_frames), expected);
    assert.equal(stream.width, file.report.width); assert.equal(stream.height, file.report.height);
  }
  checks.push('both downloaded checkout GIF presets decode with exact frame counts and fixed canvas');
  await check('exported offline HTML includes functioning GIF encoder with no CDN', `window.__mediaReports.filter(item=>item.format==='gif').length === 2 && window.__mediaReports.at(-1).theme === 'dark'`);
  await select('#theme','dark');
  await select('#palette','ocean');
  await evaluate(`window.__nativeURL=URL.createObjectURL;URL.createObjectURL=blob=>{window.__htmlDownload=blob;return window.__nativeURL(blob);};`);
  await click('[data-action="export"]');
  const darkHtml = await evaluate('window.__htmlDownload.text()');
  await writeFile(join(out,'exported-dark-checkout.html'),darkHtml);
  await evaluate(`localStorage.setItem('software-anatomy-theme','light');localStorage.setItem('software-anatomy-palette','forest')`);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await send('Page.navigate', { url: pathToFileURL(join(out,'exported-dark-checkout.html')).href });
  await wait(`document.querySelector('#app')?.dataset.step === '0'`);
  await check('offline HTML preserves Ocean diagrams and neutral Dark page over storage and OS preferences', `document.querySelector('#theme').value === 'dark' && document.documentElement.dataset.resolvedTheme === 'dark' && document.querySelector('#palette').value === 'ocean' && getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() === '#18181b' && getComputedStyle(document.querySelector('#diagram')).getPropertyValue('--pele-bg').trim() === '#121f30'`);
  await send('Page.navigate', { url: pathToFileURL(resolve('dist/enterprise.html')).href });
  await wait(`document.querySelector('#app')?.dataset.panel === 'auto'`);
  await check('enterprise opens authored panel and original model counts', `!document.querySelector('#panel-navigation').hidden && document.querySelector('#inspector-content').textContent.includes('16') && document.querySelectorAll('[data-record]').length === 11`);
  await click('[data-view="sequence"]');
  await evaluate(`(() => { const range=document.querySelector('#timeline');range.value='17';range.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await check('enterprise phase follows canonical event index and local messages seek globally', `document.querySelector('#diagram [aria-pressed="true"][data-seek="17"]') !== null && document.querySelector('#app').dataset.step === '17'`);
  await click('[data-view="architecture"]');
  await check('cross-boundary event follows its source panel and highlights continuation', `document.querySelector('.current-continuation[data-continuation="request-fulfillment"]') !== null && document.querySelector('#panel-description').textContent.includes('At-least-once')`);
  await select('#scenario', 'compensation');
  await evaluate(`(() => { const range=document.querySelector('#timeline');range.value=range.max;range.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await click('[data-select="payment_attempts"]');
  await check('enterprise compensation keeps capture and unknown refund independently inspectable', `document.querySelector('#inspector-content').textContent.includes('captured') && document.querySelector('#inspector-content').textContent.includes('unknown') && document.querySelector('[data-record="payment_attempts"]').textContent.includes('capture: captured') && document.querySelector('[data-record="payment_attempts"]').textContent.includes('refund: unknown')`);
  await click('[data-view="erd"]');
  await select('#panel', 'payment-data');
  await check('enterprise ERD panels keep labelled cross-panel FK identities', `document.querySelector('#continuations').textContent.includes('payment_attempts.order_id') && document.querySelector('#diagram [data-select="orders"]') !== null`);
  await screenshot('enterprise-dark');
  await select('#theme','light');
  await click('[data-view="sequence"]'); await select('#panel','resolution');
  await screenshot('enterprise-light');
  await check('enterprise detail-panel labels retain readable minimum', labelFloor);
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: pathToFileURL(resolve('dist/output-targets.html')).href });
  await wait(`document.querySelector('#readable svg') !== null`);
  await check('document reflow keeps all seven nodes and feedback edge', `document.querySelectorAll('#readable .pele-node').length === 7 && document.querySelectorAll('#readable .pele-edge').length === 7 && document.querySelector('#readable [data-id="L_review_profiles_0"]') !== null`);
  await check('document SVG fits actual 650px content box without overflow', `document.querySelector('#readable svg').getBoundingClientRect().width <= 650 && document.querySelector('#readable .content-box').scrollWidth <= 650`);
  await check('document labels remain at least 14px at final placement', `Math.min(...[...document.querySelectorAll('#readable svg text')].map(el => { const m = el.getScreenCTM(); return parseFloat(getComputedStyle(el).fontSize) * Math.hypot(m.a,m.b); })) >= 13.9`);
  await check('slide refuses a diagram that needs unreadable scaling', `document.querySelector('#slide-fit').textContent.includes('Split into panels')`);
  await screenshot('output-targets');
  assert.deepEqual(errors, [], 'No uncaught browser exceptions'); checks.push('no uncaught browser exceptions');
  assert.deepEqual(externalRequests, [], 'No HTTP requests from standalone or exported HTML'); checks.push('standalone and exported HTML make no HTTP requests');
  // Serve the exact Pages artifact under a project prefix, as GitHub Pages does.
  siteServer = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (!pathname.startsWith('/software-anatomy/')) { response.writeHead(404); response.end(); return; }
    const file = pathname.slice('/software-anatomy/'.length) || 'index.html';
    if (file.includes('..')) { response.writeHead(403); response.end(); return; }
    try {
      const mime = { html:'text/html',mjs:'text/javascript',css:'text/css',json:'application/json',gif:'image/gif',svg:'image/svg+xml' }[file.split('.').pop()] ?? 'application/octet-stream';
      const contents = await readFile(resolve('dist',file));response.writeHead(200,{'Content-Type':mime});response.end(contents);
    } catch { response.writeHead(404);response.end(); }
  });
  await new Promise(done=>siteServer.listen(0,'127.0.0.1',done));
  const siteOrigin = `http://127.0.0.1:${siteServer.address().port}`;
  await send('Page.navigate',{url:siteOrigin+'/software-anatomy/'});
  await wait(`document.documentElement.dataset.resolvedTheme === 'light'`);
  await check('Pages landing loads relative module and all demo links under project prefix', `document.querySelector('a[href="enterprise.html"]').href.includes('/software-anatomy/enterprise.html') && document.querySelector('a[href="checkout.html"]').href.includes('/software-anatomy/checkout.html')`);
  await select('#theme','dark');
  await check('Pages landing supports explicit Dark theme', `document.documentElement.dataset.resolvedTheme === 'dark'`);
  await select('#palette','ocean');
  await check('Pages diagram selector changes preview colors while page stays neutral', `document.querySelector('.hero-figure #palette').value === 'ocean' && document.querySelector('.nav #palette') === null && getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() === '#18181b' && getComputedStyle(document.querySelector('.diagram-scroll')).getPropertyValue('--pele-bg').trim() === '#121f30'`);
  await screenshot('site-desktop-dark');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await check('Pages mobile contains wide preview without shrinking labels or page overflow', `document.documentElement.scrollWidth <= 390 && document.querySelector('.diagram-scroll').scrollWidth > document.querySelector('.diagram-scroll').clientWidth && Math.min(...[...document.querySelectorAll('.diagram-scroll svg text')].map(el=>{const m=el.getScreenCTM();return parseFloat(getComputedStyle(el).fontSize)*Math.hypot(m.a,m.b)}))>=13.9`);
  await screenshot('site-mobile-dark');
  await check('Pages integration manifest is reachable as local-stdio metadata', `(async()=>{const data=await(await fetch('agent-tools.json')).json();return data.transport==='local-stdio' && data.remoteEndpoint===null && data.mcp.tools.length===6})()`);
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await send('Page.reload');
  await wait(`document.documentElement.dataset.resolvedTheme === 'dark'`);
  await check('Pages reduced-motion view keeps GIF downloads and removes unpausable previews', `document.querySelectorAll('.media-card details').length===0 && document.querySelectorAll('.media-card a[download]').length===2`);
  assert.ok(externalRequests.every(url=>url.startsWith(siteOrigin+'/')), 'Landing makes no third-party HTTP requests');
  assert.deepEqual(errors, [], 'No uncaught exceptions in Pages landing');
  const source = await readFile('dist/checkout.html');
  const enterpriseSource = await readFile('dist/enterprise.html');
  const presentationSource = await readFile('dist/checkout-presentation.html');
  const { createHash } = await import('node:crypto');
  await writeFile(join(out, 'verification.json'), JSON.stringify({ candidate: 'software-anatomy@0.1.0', dependencies: { pele: '1.13.0', gifenc: '1.0.3' }, presentationArtifactSha256: createHash('sha256').update(presentationSource).digest('hex'), artifactSha256: createHash('sha256').update(source).digest('hex'), enterpriseArtifactSha256: createHash('sha256').update(enterpriseSource).digest('hex'), checkedAt: new Date().toISOString(), viewport: [1440,1100], mobileViewport: [390,844], checks, errors, externalRequests, boundary: 'Real Chromium, simulated business events; no live provider or database.' }, null, 2) + '\n');
  console.log(`PASS: ${checks.length} real-browser checks. Evidence: output/verification.json`);
} finally {
  siteServer?.closeAllConnections();
  if (siteServer) await new Promise(done=>siteServer.close(done));
  socket?.close(); chrome.kill('SIGTERM');
  await new Promise(done => chrome.exitCode !== null || chrome.signalCode !== null ? done() : chrome.once('exit', done));
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
