// src/ui/controls.js
import { DEFAULT_PARAMS, A6_PRESET, normalizeParams } from '../params.js';
import { fieldMeta } from './fields.js';

const WARNING_MESSAGES = {
  'kerf>=gap': 'kerf ≥ gap — cut will eat the inter-rib gap',
};

const EXPORT_LABELS = {
  svg: 'Fold-pattern SVG',
  'svg-ribs': 'Rib-ladder SVG',
  pdf: 'Tiled PDF',
  stl: 'Rib STL',
  'stl-full': 'Full ribs STL',
};

export function formatReadouts(metrics) {
  const rows = [
    { label: 'Flat pleated length', value: `${metrics.flatPleatedLength.toFixed(1)} mm` },
    { label: 'Usable draw', value: `${metrics.usableDraw.toFixed(1)} mm` },
    {
      label: 'Collapsed thickness',
      value: `${metrics.collapsedThickness.toFixed(1)} mm`,
      warn: metrics.collapsedThickness > 20,
    },
    { label: 'Rib count', value: String(metrics.ribCount) },
    { label: 'Magnification (approx)', value: `${metrics.magnification.toFixed(2)}×` },
    {
      label: 'Flat sheet',
      value: `${metrics.flatSheet.w.toFixed(0)} × ${metrics.flatSheet.h.toFixed(0)} mm`,
    },
  ];
  for (const w of metrics.warnings) {
    if (w === '>20mm collapse') continue; // already flagged on the Collapsed thickness row
    const msg = WARNING_MESSAGES[w] || w;
    rows.push({ label: 'Warning', value: msg, warn: true });
  }
  return rows;
}

// Grouping + fieldset order is UI structure; per-field label/unit/hint/kind/step
// now come from fields.js via fieldMeta().
const GROUPS = [
  { title: 'Type', fields: ['type'] },
  { title: 'Openings', fields: ['frontW', 'frontH', 'rearW', 'rearH'] },
  { title: 'Draw & pleats', fields: ['maxDraw', 'drawFactor', 'rib', 'gap', 'ribCount'] },
  { title: 'Corners, tabs & margins', fields: ['cornerMode', 'cornerAllowance', 'glueTab', 'endMargin'] },
  { title: 'Material & laser', fields: ['fabricThickness', 'ribThickness', 'kerf', 'bedSize', 'printOffset'] },
  { title: 'Optics', fields: ['focalLength', 'opticalOffset'] },
  { title: 'Export', fields: ['pageSize'] },
];

export function buildControlPanel(opts = {}) {
  const onChange = opts.onChange || (() => {});
  const onExport = opts.onExport || (() => {});
  let params = normalizeParams({ ...DEFAULT_PARAMS, ...(opts.params || {}) });

  const el = document.createElement('form');
  el.className = 'controls';
  if (opts.hintsOn !== false) el.classList.add('hints-on');
  el.addEventListener('submit', (e) => e.preventDefault());
  const inputs = {};

  for (const group of GROUPS) {
    const fs = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = group.title;
    fs.appendChild(legend);
    for (const key of group.fields) {
      const meta = fieldMeta(key);
      const field = document.createElement('div');
      field.className = 'field';

      const label = document.createElement('label');
      label.className = 'field-label';
      label.htmlFor = `ctl-${key}`;
      label.appendChild(document.createTextNode(meta.label));
      if (meta.unit) {
        const unit = document.createElement('span');
        unit.className = 'field-unit';
        unit.textContent = ' ' + meta.unit;
        label.appendChild(unit);
      }

      let input;
      if (meta.kind === 'select') {
        input = document.createElement('select');
        for (const opt of meta.options) {
          const o = document.createElement('option');
          o.value = opt;
          o.textContent = opt;
          input.appendChild(o);
        }
      } else {
        input = document.createElement('input');
        input.type = 'number';
        if (meta.step) input.step = String(meta.step);
        if (meta.min != null) input.min = String(meta.min);
        if (meta.max != null) input.max = String(meta.max);
      }
      input.id = `ctl-${key}`;
      input.dataset.key = key;
      input.addEventListener(meta.kind === 'select' ? 'change' : 'input', handleInput);
      inputs[key] = input;

      field.appendChild(label);
      field.appendChild(input);
      if (meta.hint) {
        const hint = document.createElement('div');
        hint.className = 'hint';
        hint.textContent = meta.hint;
        field.appendChild(hint);
      }
      fs.appendChild(field);
    }
    el.appendChild(fs);
  }

  const exportBar = document.createElement('div');
  exportBar.className = 'export-bar';
  for (const kind of ['svg', 'svg-ribs', 'pdf', 'stl', 'stl-full']) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.dataset.export = kind;
    b.textContent = EXPORT_LABELS[kind];
    b.addEventListener('click', () => onExport(kind));
    exportBar.appendChild(b);
  }
  el.appendChild(exportBar);

  const presetBar = document.createElement('div');
  presetBar.className = 'presets';
  const addPreset = (name, preset) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.dataset.preset = name;
    b.textContent = name;
    b.addEventListener('click', () => apply(normalizeParams({ ...preset })));
    presetBar.appendChild(b);
  };
  addPreset('A6', A6_PRESET);
  addPreset('Default', DEFAULT_PARAMS);
  el.appendChild(presetBar);

  const readouts = document.createElement('div');
  readouts.className = 'readouts';
  readouts.setAttribute('aria-live', 'polite');
  el.appendChild(readouts);

  function handleInput() {
    apply(readParams());
  }

  function readParams() {
    const next = { ...params };
    for (const key of Object.keys(inputs)) {
      const input = inputs[key];
      if (input.tagName === 'SELECT') next[key] = input.value;
      else if (input.value === '') next[key] = null;
      else next[key] = Number(input.value);
    }
    return normalizeParams(next);
  }

  function apply(next) {
    params = next;
    refresh();
    onChange(params);
  }

  function refresh() {
    const straight = params.type === 'straight';
    for (const key of Object.keys(inputs)) {
      const input = inputs[key];
      const v = params[key];
      input.value = v == null ? '' : String(v);
      if (key === 'rearW' || key === 'rearH') input.disabled = straight;
    }
  }

  function setReadouts(metrics) {
    readouts.innerHTML = '';
    for (const r of formatReadouts(metrics)) {
      const row = document.createElement('div');
      row.className = 'readout' + (r.warn ? ' warn' : '');
      const k = document.createElement('span');
      k.className = 'readout-k';
      k.textContent = r.label;
      const val = document.createElement('span');
      val.className = 'readout-v';
      val.textContent = r.value;
      row.append(k, val);
      readouts.appendChild(row);
    }
  }

  function setHintsOn(on) {
    el.classList.toggle('hints-on', !!on);
  }

  refresh();
  return { el, setReadouts, setHintsOn };
}
