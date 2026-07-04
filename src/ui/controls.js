// src/ui/controls.js
import { DEFAULT_PARAMS, A6_PRESET, normalizeParams } from '../params.js';

export function formatReadouts(metrics) {
  return [
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
}

const GROUPS = [
  { title: 'Type', fields: [{ key: 'type', kind: 'select', options: ['straight', 'tapered'] }] },
  {
    title: 'Openings',
    fields: [
      { key: 'frontW' }, { key: 'frontH' },
      { key: 'rearW' }, { key: 'rearH' },
    ],
  },
  {
    title: 'Draw & pleats',
    fields: [
      { key: 'maxDraw' }, { key: 'drawFactor', step: 0.1 }, { key: 'rib' },
      { key: 'gap', step: 0.1 }, { key: 'ribCount' },
    ],
  },
  {
    title: 'Corners, tabs & margins',
    fields: [{ key: 'cornerAllowance' }, { key: 'glueTab' }, { key: 'endMargin' }],
  },
  {
    title: 'Material & laser',
    fields: [
      { key: 'fabricThickness', step: 0.1 }, { key: 'ribThickness', step: 0.1 },
      { key: 'kerf', step: 0.01 },
    ],
  },
  { title: 'Optics', fields: [{ key: 'focalLength' }, { key: 'opticalOffset' }] },
  { title: 'Export', fields: [{ key: 'pageSize', kind: 'select', options: ['A4', 'A3', 'Letter'] }] },
];

export function buildControlPanel(opts = {}) {
  const onChange = opts.onChange || (() => {});
  const onExport = opts.onExport || (() => {});
  let params = normalizeParams({ ...DEFAULT_PARAMS, ...(opts.params || {}) });

  const el = document.createElement('form');
  el.className = 'controls';
  el.addEventListener('submit', (e) => e.preventDefault());
  const inputs = {};

  for (const group of GROUPS) {
    const fs = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = group.title;
    fs.appendChild(legend);
    for (const field of group.fields) {
      const label = document.createElement('label');
      label.textContent = field.key;
      let input;
      if (field.kind === 'select') {
        input = document.createElement('select');
        for (const opt of field.options) {
          const o = document.createElement('option');
          o.value = opt;
          o.textContent = opt;
          input.appendChild(o);
        }
      } else {
        input = document.createElement('input');
        input.type = 'number';
        if (field.step) input.step = String(field.step);
      }
      input.dataset.key = field.key;
      input.addEventListener(field.kind === 'select' ? 'change' : 'input', handleInput);
      inputs[field.key] = input;
      label.appendChild(input);
      fs.appendChild(label);
    }
    el.appendChild(fs);
  }

  const exportBar = document.createElement('div');
  exportBar.className = 'export-bar';
  for (const kind of ['svg', 'pdf', 'stl']) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.export = kind;
    b.textContent = `Export ${kind.toUpperCase()}`;
    b.addEventListener('click', () => onExport(kind));
    exportBar.appendChild(b);
  }
  el.appendChild(exportBar);

  const presetBar = document.createElement('div');
  presetBar.className = 'presets';
  const addPreset = (name, preset) => {
    const b = document.createElement('button');
    b.type = 'button';
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
      k.className = 'k';
      k.textContent = r.label;
      const val = document.createElement('span');
      val.className = 'v';
      val.textContent = r.value;
      row.append(k, val);
      readouts.appendChild(row);
    }
  }

  refresh();
  return { el, setReadouts };
}
