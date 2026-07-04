// src/ui/appShell.js

export const LASER_LEGEND = [
  { color: '#FF0000', name: 'CUT', op: 'cut' },
  { color: '#FF00FF', name: 'GLUE_TAB', op: 'cut' },
  { color: '#0000FF', name: 'FOLD_MOUNTAIN', op: 'score' },
  { color: '#00AA00', name: 'FOLD_VALLEY', op: 'score' },
  { color: '#000000', name: 'ENGRAVE', op: 'engrave' },
];

/** Full inner HTML for the collapsible intro/help panel. */
export function helpPanelHTML() {
  const legend = LASER_LEGEND.map(
    (l) =>
      `<li class="legend-row">` +
      `<span class="legend-swatch" style="background:${l.color}"></span>` +
      `<code class="legend-name">${l.name}</code> ` +
      `<span class="legend-color">${l.color}</span> — ${l.op}` +
      `</li>`
  ).join('');
  return (
    `<h2 class="help-title">What this is</h2>` +
    `<p class="help-lede">A parametric generator for camera bellows: set your openings and draw, ` +
    `then export laser-ready fold patterns and rib STLs.</p>` +
    `<h3>Quickstart</h3>` +
    `<ol class="help-quickstart">` +
    `<li>Load the <strong>A6</strong> preset to start from a known-good bellows.</li>` +
    `<li>Tweak the openings, draw and pleats to fit your camera.</li>` +
    `<li>Check the <strong>Flat</strong> and <strong>3D</strong> tabs to sanity-check the pattern and fold.</li>` +
    `<li>Export the fold-pattern SVG (or tiled PDF) and rib STL, then cut.</li>` +
    `</ol>` +
    `<h3>Laser colour legend</h3>` +
    `<ul class="help-legend">${legend}</ul>` +
    `<h3>Before you cut</h3>` +
    `<ul class="help-caveats">` +
    `<li>Always run a <strong>paper fold-test</strong> before cutting your final material.</li>` +
    `<li><strong>Tapered</strong> bellows are experimental — verify the geometry carefully.</li>` +
    `</ul>`
  );
}

/** Populate a .help-panel element with the intro/help content. */
export function fillHelpPanel(el) {
  el.innerHTML = helpPanelHTML();
  return el;
}

/** Wire a "?" button to toggle `.is-open` on a help panel and keep aria-expanded in sync. */
export function wireHelpToggle(button, panel) {
  button.setAttribute('aria-expanded', panel.classList.contains('is-open') ? 'true' : 'false');
  button.addEventListener('click', () => {
    const open = panel.classList.toggle('is-open');
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}

/**
 * Build the responsive app shell: sticky header (title, preset buttons, a
 * "Show hints" toggle, a "?" help button), the Flat/3D preview tabs, the phone
 * bottom segmented bar (Controls/Flat/3D), and the collapsible help panel.
 *
 * Owns `activeView` and all `.is-active` / `aria-selected` toggling; calls
 * `onViewChange(view)` whenever the active view actually changes so the caller
 * can resize the 3D canvas.
 *
 * @param {Object} [opts]
 * @param {(view:'flat'|'3d'|'controls')=>void} [opts.onViewChange]
 * @param {(on:boolean)=>void} [opts.onToggleHints]
 * @param {(name:'A6'|'Default')=>void} [opts.onPreset]
 * @param {string} [opts.initialView]
 * @returns {{
 *   root: HTMLElement, headerEl: HTMLElement, panelHost: HTMLElement,
 *   previewArea: HTMLElement, svgHost: HTMLElement, canvas: HTMLCanvasElement,
 *   slider: HTMLInputElement, helpPanel: HTMLElement,
 *   setActiveView: (view: string) => void, setHintsOn: (on: boolean) => void
 * }}
 */
export function buildAppShell(opts = {}) {
  const onViewChange = opts.onViewChange || (() => {});
  const onToggleHints = opts.onToggleHints || (() => {});
  const onPreset = opts.onPreset || (() => {});
  let activeView = opts.initialView || 'flat';

  const root = document.createElement('div');
  root.className = 'app-shell';

  // --- Header ---------------------------------------------------------------
  const headerEl = document.createElement('header');
  headerEl.className = 'app-header';

  const title = document.createElement('h1');
  title.className = 'app-title';
  title.textContent = 'Bellows Generator';

  const headerActions = document.createElement('div');
  headerActions.className = 'header-actions';

  const makePreset = (name) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.dataset.preset = name;
    b.textContent = name;
    b.addEventListener('click', () => onPreset(name));
    return b;
  };

  const hintsToggle = document.createElement('button');
  hintsToggle.type = 'button';
  hintsToggle.className = 'toggle';
  hintsToggle.dataset.role = 'hints-toggle';
  hintsToggle.setAttribute('aria-pressed', 'true');
  hintsToggle.textContent = 'Show hints';
  hintsToggle.addEventListener('click', () => {
    const next = hintsToggle.getAttribute('aria-pressed') !== 'true';
    setHintsOn(next);
    onToggleHints(next);
  });

  const helpBtn = document.createElement('button');
  helpBtn.type = 'button';
  helpBtn.className = 'btn';
  helpBtn.dataset.role = 'help-toggle';
  helpBtn.setAttribute('aria-expanded', 'false');
  helpBtn.setAttribute('aria-label', 'Help');
  helpBtn.textContent = '?';
  headerActions.append(makePreset('A6'), makePreset('Default'), hintsToggle, helpBtn);
  headerEl.append(title, headerActions);

  // --- Help panel (hidden by default; open = .is-open) ----------------------
  const helpPanel = document.createElement('div');
  helpPanel.className = 'help-panel';
  helpPanel.setAttribute('role', 'region');
  helpPanel.setAttribute('aria-label', 'Help');

  fillHelpPanel(helpPanel);
  wireHelpToggle(helpBtn, helpPanel);

  // --- Preview area ---------------------------------------------------------
  const previewArea = document.createElement('div');
  previewArea.className = 'preview-area';

  const tabs = document.createElement('div');
  tabs.className = 'preview-tabs';
  tabs.setAttribute('role', 'tablist');
  const makeTab = (view, text) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tab-btn';
    b.dataset.view = view;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', 'false');
    b.textContent = text;
    b.addEventListener('click', () => setActiveView(view));
    return b;
  };
  tabs.append(makeTab('flat', 'Flat'), makeTab('3d', '3D'));

  const flatPanel = document.createElement('div');
  flatPanel.className = 'preview-panel';
  flatPanel.dataset.view = 'flat';
  flatPanel.setAttribute('role', 'tabpanel');
  const svgHost = document.createElement('div');
  svgHost.className = 'flat-preview';
  flatPanel.appendChild(svgHost);

  const threePanel = document.createElement('div');
  threePanel.className = 'preview-panel';
  threePanel.dataset.view = '3d';
  threePanel.setAttribute('role', 'tabpanel');
  const canvas = document.createElement('canvas');
  canvas.className = 'three-canvas';
  threePanel.appendChild(canvas);

  const collapseRow = document.createElement('div');
  collapseRow.className = 'collapse-row';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '1';
  slider.step = '0.01';
  slider.value = '1';
  slider.className = 'collapse-slider';
  slider.setAttribute('aria-label', 'Collapse / extend');
  collapseRow.appendChild(slider);

  previewArea.append(tabs, flatPanel, threePanel, collapseRow);

  // --- Controls host (desktop sidebar / phone "Controls" panel) -------------
  const panelHost = document.createElement('div');
  panelHost.className = 'controls-host';
  panelHost.dataset.view = 'controls';

  // --- Phone segmented bar --------------------------------------------------
  const segmentedBar = document.createElement('nav');
  segmentedBar.className = 'segmented-bar';
  segmentedBar.setAttribute('role', 'tablist');
  const makeSeg = (view, text) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg-btn';
    b.dataset.view = view;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', 'false');
    b.textContent = text;
    b.addEventListener('click', () => setActiveView(view));
    return b;
  };
  segmentedBar.append(
    makeSeg('controls', 'Controls'),
    makeSeg('flat', 'Flat'),
    makeSeg('3d', '3D'),
  );

  root.append(headerEl, helpPanel, panelHost, previewArea, segmentedBar);

  // --- View + hints state ---------------------------------------------------
  function applyActiveClasses() {
    for (const el of root.querySelectorAll('[data-view]')) {
      const match = el.dataset.view === activeView;
      el.classList.toggle('is-active', match);
      if (el.getAttribute('role') === 'tab') {
        el.setAttribute('aria-selected', String(match));
      }
    }
  }

  function setActiveView(view) {
    if (view === activeView) return;
    activeView = view;
    applyActiveClasses();
    onViewChange(view);
  }

  function setHintsOn(on) {
    hintsToggle.setAttribute('aria-pressed', String(!!on));
    hintsToggle.classList.toggle('is-active', !!on);
  }

  // Seed initial visibility by calling applyActiveClasses directly
  // (setActiveView skips if view === activeView, so we call apply directly)
  applyActiveClasses();

  return {
    root,
    headerEl,
    panelHost,
    previewArea,
    svgHost,
    canvas,
    slider,
    helpPanel,
    setActiveView,
    setHintsOn,
  };
}
