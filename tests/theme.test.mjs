import { test } from 'node:test';
import assert from 'node:assert/strict';
import { themePalette, resolveTheme, installTheme } from '../toolkit/theme.mjs';

function fixture({ osDark = false, saved, savedPalette, exported, exportedPalette, blocked = false } = {}) {
  const media = new EventTarget(); media.matches = osDark;
  const writes = [];
  const window = {
    CustomEvent,
    matchMedia: query => { assert.equal(query, '(prefers-color-scheme: dark)'); return media; },
    get localStorage() {
      if (blocked) throw new Error('Storage denied');
      return { getItem: key => key === 'software-anatomy-palette' ? savedPalette : saved, setItem: (key, value) => writes.push([key, value]) };
    }
  };
  const properties = new Map();
  const html = { dataset: { ...(exported ? { theme: exported } : {}), ...(exportedPalette ? { palette: exportedPalette } : {}) }, style: { setProperty: (key, value) => properties.set(key, value) } };
  const root = new EventTarget(); root.dataset = {};
  root.ownerDocument = { defaultView: window, documentElement: html };
  const select = new EventTarget(); select.value = '';
  const paletteSelect = new EventTarget(); paletteSelect.value = '';
  const system = value => { media.matches = value; media.dispatchEvent(new Event('change')); };
  return { root, select, paletteSelect, html, writes, properties, system };
}

test('auto resolves system preference and explicit modes override it', () => {
  assert.equal(resolveTheme('auto', false), 'light');
  assert.equal(resolveTheme('auto', true), 'dark');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.throws(() => resolveTheme('sepia', false), RangeError);
  assert.throws(() => themePalette('auto'), RangeError);
});

test('Auto tracks OS changes while explicit selection persists and stays stable', () => {
  const f = fixture();
  const changes = [];
  f.root.addEventListener('anatomy:themechange', event => changes.push(event.detail));
  const controller = installTheme(f.root, f.select);
  assert.equal(controller.preference, 'auto');
  assert.equal(f.html.dataset.resolvedTheme, 'light');
  f.system(true);
  assert.equal(controller.resolved, 'dark');
  assert.equal(f.properties.get('--paper'), themePalette('dark').paper);
  assert.equal(f.properties.get('--diagram-border'), themePalette('dark').diagramBorder);
  f.select.value = 'light'; f.select.dispatchEvent(new Event('change'));
  assert.equal(controller.preference, 'light');
  assert.equal(f.select.value, 'light');
  assert.deepEqual(f.writes.findLast(([key]) => key === 'software-anatomy-theme'), ['software-anatomy-theme', 'light']);
  f.system(false); f.system(true);
  assert.equal(controller.resolved, 'light');
  assert.equal(f.html.style.colorScheme, 'light');
  assert.equal(f.root.dataset.resolvedTheme, 'light');
  assert.equal(changes.at(-1).palette, themePalette('light'));
  controller.destroy();
  const count = changes.length;
  f.select.value = 'auto'; f.select.dispatchEvent(new Event('change'));
  f.system(false);
  assert.equal(controller.preference, 'light');
  assert.equal(changes.length, count);
});

test('exported preference survives reload and storage denial does not block themes', () => {
  const f = fixture({ osDark: true, saved: 'dark', exported: 'light', blocked: true });
  const controller = installTheme(f.root, f.select);
  assert.equal(controller.resolved, 'light');
  assert.doesNotThrow(() => controller.setPreference('dark'));
  assert.equal(f.html.dataset.theme, 'dark');
  assert.equal(f.html.dataset.resolvedTheme, 'dark');
  controller.destroy();
  const saved = fixture({ saved: 'dark' });
  const restored = installTheme(saved.root, saved.select);
  assert.equal(restored.resolved, 'dark');
  restored.destroy();
  const invalid = fixture({ saved: 'bad-value' });
  const fallback = installTheme(invalid.root, invalid.select);
  assert.equal(fallback.preference, 'auto');
  fallback.destroy();
});

test('an explicit initial mode wins over exported and stored preferences', () => {
  const f = fixture({ osDark: true, saved: 'dark', exported: 'dark' });
  const controller = installTheme(f.root, f.select, { initial: 'light' });
  assert.equal(controller.resolved, 'light');
  assert.throws(() => controller.setPreference('invalid'), RangeError);
  assert.equal(controller.preference, 'light');
  controller.destroy();
});

function luminance(hex) {
  const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a, b) { const l = [luminance(a), luminance(b)].sort((a, b) => a - b); return (l[1] + 0.05) / (l[0] + 0.05); }

test('all palettes retain readable normal, selected and warning text in both modes', () => {
  for (const name of ['neutral', 'ocean', 'forest']) for (const mode of ['light', 'dark']) {
    const p = themePalette(mode, name);
    for (const [fg, bg] of [['ink', 'surface'], ['muted', 'surface'], ['muted', 'panel'], ['accent', 'accentSoft'], ['amber', 'amberSoft'], ['selected', 'selectedSoft']]) {
      assert.ok(contrast(p[fg], p[bg]) >= 4.5, `${name}/${mode}: ${fg}/${bg} contrast ${contrast(p[fg], p[bg])}`);
    }
    assert.ok(Object.isFrozen(p));
  }
});

test('palette selection persists independently of mode and follows Auto across OS changes', () => {
  const f = fixture();
  const controller = installTheme(f.root, f.select, { paletteSelect: f.paletteSelect });
  assert.equal(controller.palette, 'neutral');
  f.paletteSelect.value = 'ocean'; f.paletteSelect.dispatchEvent(new Event('change'));
  assert.equal(controller.preference, 'auto');
  assert.equal(f.html.dataset.palette, 'ocean');
  assert.deepEqual(f.writes.at(-1), ['software-anatomy-palette', 'ocean']);
  f.system(true);
  assert.equal(controller.palette, 'ocean');
  assert.equal(f.properties.get('--surface'), themePalette('dark', 'ocean').surface);
  assert.throws(() => controller.setPalette('invalid'), RangeError);
  assert.equal(controller.palette, 'ocean');
  controller.destroy();
  f.paletteSelect.value = 'forest'; f.paletteSelect.dispatchEvent(new Event('change'));
  assert.equal(controller.palette, 'ocean');
});

test('exported palette wins over storage, and storage denial still allows switching', () => {
  for (const blocked of [true, false]) {
    const f = fixture({ savedPalette: 'forest', exportedPalette: 'ocean', blocked });
    const controller = installTheme(f.root, f.select, { paletteSelect: f.paletteSelect });
    assert.equal(controller.palette, 'ocean');
    assert.doesNotThrow(() => controller.setPalette('neutral'));
    assert.equal(f.html.dataset.palette, 'neutral');
    controller.destroy();
  }
  for (const [savedPalette, expected] of [['forest', 'forest'], ['invalid', 'neutral']]) {
    const f = fixture({ savedPalette });
    const controller = installTheme(f.root, f.select);
    assert.equal(controller.palette, expected);
    controller.destroy();
  }
  assert.throws(() => themePalette('light', '__proto__'), RangeError);
});
