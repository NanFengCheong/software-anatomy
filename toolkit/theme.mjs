const forest = Object.freeze({
  light: Object.freeze({
    paper: '#f6f7f4', surface: '#ffffff', panel: '#fbfcfa', ink: '#202b2a',
    muted: '#5e6b66', line: '#d9e1d8', accent: '#12664f', accentSoft: '#e9f5ec',
    amber: '#865409', amberSoft: '#fff2d8', selected: '#3d59a0', selectedSoft: '#eef2ff',
    hover: '#edf2e9', borderStrong: '#aab9ac', diagramLine: '#748b79',
    diagramSurface: '#f7faf4', diagramAlt: '#edf3e8', diagramBorder: '#aebfaf',
    cluster: '#f2f6ee', clusterBorder: '#bdceb7', focus: '#16765f', inverse: '#ffffff',
    dotGrid: '#d4ddd4', subtle: '#a7b5a9', thumb: '#477c55', brandAccent: '#b9e7a7',
    shadow: '#273b2710'
  }),
  dark: Object.freeze({
    paper: '#0f1513', surface: '#151e1a', panel: '#121b17', ink: '#e4eee6',
    muted: '#a5b6a9', line: '#34463a', accent: '#8bd4a5', accentSoft: '#203d2b',
    amber: '#edc47a', amberSoft: '#3b3020', selected: '#aec3ff', selectedSoft: '#28354d',
    hover: '#223127', borderStrong: '#6d8674', diagramLine: '#a1b8a7',
    diagramSurface: '#1b2920', diagramAlt: '#223126', diagramBorder: '#728c7a',
    cluster: '#17231c', clusterBorder: '#4b6352', focus: '#a2e3b4', inverse: '#111a14',
    dotGrid: '#2c3a30', subtle: '#7a8d7e', thumb: '#92cda3', brandAccent: '#287446',
    shadow: '#00000044'
  })
});

const neutral = Object.freeze({
  light: Object.freeze({
    paper: '#f5f5f5', surface: '#ffffff', panel: '#fafafa', ink: '#18181b',
    muted: '#52525b', line: '#e4e4e7', accent: '#2563eb', accentSoft: '#eff6ff',
    amber: '#865409', amberSoft: '#fff2d8', selected: '#7c3aed', selectedSoft: '#f5f3ff',
    hover: '#f0f0f2', borderStrong: '#a1a1aa', diagramLine: '#71717a',
    diagramSurface: '#fafafa', diagramAlt: '#f4f4f5', diagramBorder: '#a1a1aa',
    cluster: '#fafafa', clusterBorder: '#d4d4d8', focus: '#2563eb', inverse: '#ffffff',
    dotGrid: '#e4e4e7', subtle: '#a1a1aa', thumb: '#2563eb', brandAccent: '#93c5fd',
    shadow: '#18181b0d'
  }),
  dark: Object.freeze({
    paper: '#111113', surface: '#18181b', panel: '#141416', ink: '#f4f4f5',
    muted: '#a1a1aa', line: '#323238', accent: '#93c5fd', accentSoft: '#172b48',
    amber: '#fcd68a', amberSoft: '#3b3020', selected: '#c4b5fd', selectedSoft: '#302448',
    hover: '#27272a', borderStrong: '#71717a', diagramLine: '#a1a1aa',
    diagramSurface: '#202023', diagramAlt: '#27272a', diagramBorder: '#71717a',
    cluster: '#1c1c1f', clusterBorder: '#48484f', focus: '#93c5fd', inverse: '#111113',
    dotGrid: '#303035', subtle: '#71717a', thumb: '#93c5fd', brandAccent: '#2563eb',
    shadow: '#00000044'
  })
});
const palettes = Object.freeze({
  neutral, forest,
  ocean: Object.freeze({
    light: Object.freeze({ ...neutral.light,
      paper: '#f3f7fc', panel: '#f5f8fc', ink: '#172b46', muted: '#52657c',
      line: '#d8e3ef', accent: '#155e75', accentSoft: '#e0f2fe', hover: '#e9f1fa',
      diagramLine: '#607c9d', diagramSurface: '#f1f7ff', diagramAlt: '#e5effb',
      diagramBorder: '#8da9c7', cluster: '#edf5ff', clusterBorder: '#bbd0e9',
      focus: '#155e75', thumb: '#155e75', brandAccent: '#67e8f9'
    }),
    dark: Object.freeze({ ...neutral.dark,
      paper: '#0c1421', surface: '#121f30', panel: '#0f1a29', ink: '#e6edf7',
      muted: '#a1b4cd', line: '#2c405b', accent: '#67e8f9', accentSoft: '#113345',
      hover: '#1c3049', diagramLine: '#99b5d5', diagramSurface: '#182a40',
      diagramAlt: '#203651', diagramBorder: '#6a88ac', cluster: '#14253b',
      clusterBorder: '#385675', focus: '#67e8f9', thumb: '#67e8f9', brandAccent: '#155e75'
    })
  })
});

export function themePalette(resolvedTheme, name = 'neutral') {
  if (!Object.hasOwn(palettes, name)) throw new RangeError(`Unknown palette: ${name}`);
  if (!Object.hasOwn(palettes[name], resolvedTheme)) throw new RangeError(`Unknown resolved theme: ${resolvedTheme}`);
  return palettes[name][resolvedTheme];
}

export function resolveTheme(preference, darkMatches) {
  if (!['auto', 'light', 'dark'].includes(preference)) throw new RangeError(`Unknown theme preference: ${preference}`);
  return preference === 'auto' ? darkMatches ? 'dark' : 'light' : preference;
}

/** Apply a saved preference, follow OS changes in Auto, and release listeners. */
export function installTheme(root, select, { initial, paletteSelect, palette: initialPalette } = {}) {
  const document = root.ownerDocument;
  const window = document.defaultView;
  const html = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const valid = value => ['auto', 'light', 'dark'].includes(value);
  let saved, savedPalette;
  try {
    saved = window.localStorage.getItem('software-anatomy-theme');
    savedPalette = window.localStorage.getItem('software-anatomy-palette');
  } catch { /* Storage can be blocked in offline files. */ }
  let preference = valid(initial) ? initial : valid(html.dataset.theme) ? html.dataset.theme : valid(saved) ? saved : 'auto';
  const validPalette = value => Object.hasOwn(palettes, value);
  let palette = validPalette(initialPalette) ? initialPalette : validPalette(html.dataset.palette) ? html.dataset.palette : validPalette(savedPalette) ? savedPalette : 'neutral';
  let resolved;
  function apply(persist = false) {
    resolved = resolveTheme(preference, media.matches);
    html.dataset.theme = preference; html.dataset.resolvedTheme = resolved;
    root.dataset.theme = preference; root.dataset.resolvedTheme = resolved;
    html.dataset.palette = palette; root.dataset.palette = palette;
    html.style.colorScheme = resolved;
    // These same tokens are used to paint standalone exports, avoiding browser
    // system colors or an export that depends on the host document's stylesheet.
    for (const [key, value] of Object.entries(themePalette(resolved, palette))) html.style.setProperty(`--${key.replace(/[A-Z]/g, char => '-' + char.toLowerCase())}`, value);
    if (select) select.value = preference;
    if (paletteSelect) paletteSelect.value = palette;
    if (persist) { try {
      window.localStorage.setItem('software-anatomy-theme', preference);
      window.localStorage.setItem('software-anatomy-palette', palette);
    } catch { /* Theme still works without persistence. */ } }
    root.dispatchEvent(new window.CustomEvent('anatomy:themechange', { detail: { preference, resolved, paletteName: palette, palette: themePalette(resolved, palette) } }));
  }
  function setPreference(value) { resolveTheme(value, media.matches); preference = value; apply(true); }
  function change() { setPreference(select.value); }
  function setPalette(value) { themePalette(resolved, value); palette = value; apply(true); }
  function paletteChanged() { setPalette(paletteSelect.value); }
  function systemChanged() { if (preference === 'auto') apply(); }
  select?.addEventListener('change', change);
  paletteSelect?.addEventListener('change', paletteChanged);
  media.addEventListener('change', systemChanged);
  apply();
  return {
    get preference() { return preference; }, get resolved() { return resolved; }, get palette() { return palette; },
    setPreference, setPalette,
    destroy() { select?.removeEventListener('change', change); paletteSelect?.removeEventListener('change', paletteChanged); media.removeEventListener('change', systemChanged); }
  };
}
