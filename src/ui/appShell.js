// src/ui/appShell.js

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
  helpBtn.addEventListener('click', () => {
    const open = helpPanel.classList.toggle('is-open');
    helpBtn.setAttribute('aria-expanded', String(open));
  });

  headerActions.append(makePreset('A6'), makePreset('Default'), hintsToggle, helpBtn);
  headerEl.append(title, headerActions);

  // --- Help panel (hidden by default; open = .is-open) ----------------------
  const helpPanel = document.createElement('div');
  helpPanel.className = 'help-panel';
  helpPanel.setAttribute('role', 'region');
  helpPanel.setAttribute('aria-label', 'Help');

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
