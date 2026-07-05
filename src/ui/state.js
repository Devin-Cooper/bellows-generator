import { paramsFromQuery, paramsToQuery } from '../params.js';
import { buildPatternModel, buildFoldModel } from '../geometry/index.js';
import { renderPatternSVG, renderRibLadderSVG } from '../render/svg.js';
import { BellowsViewer } from '../render/three.js';
import { buildControlPanel } from './controls.js';
import { buildAppShell } from './appShell.js';
import { mountPreview, buildPreviewToolbar } from './preview.js';
import { makeSVGBlob, downloadBlob, triggerDownload } from '../export/download.js';
import { exportTiledPDF } from '../export/pdf.js';
import { exportRibsSTL, exportFullRibsSTL } from '../export/stl.js';

const HINTS_KEY = 'bellows.hintsOn';

export function debounce(fn, ms) {
  let id;
  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), ms);
  };
}

export function formatExtensionLabel(value) {
  return `Extension ${Math.round(value * 100)}%`;
}

function readHintsOn() {
  try {
    const v = localStorage.getItem(HINTS_KEY);
    return v === null ? true : v === 'true';
  } catch {
    return true;
  }
}

function writeHintsOn(on) {
  try {
    localStorage.setItem(HINTS_KEY, String(on));
  } catch {
    /* ignore storage failures (private mode / disabled) */
  }
}

export function initApp(rootEl) {
  let params = paramsFromQuery(location.search);
  let extension = 1;
  let panel;
  let previewApi = null;

  // Build the responsive shell; state.js only wires callbacks to it.
  const shell = buildAppShell({
    initialView: 'flat',
    onViewChange(view) {
      // A hidden canvas has 0 size; re-size when the 3D tab becomes visible.
      if (view === '3d') viewer.resize();
    },
    onToggleHints(on) {
      writeHintsOn(on);
      if (panel) panel.setHintsOn(on);
    },
    onPreset(name) {
      // Reuse the existing control-panel preset path so params + inputs + URL
      // all update through the one code path.
      const btn = panel && panel.el.querySelector(`[data-preset="${name}"]`);
      if (btn) btn.click();
    },
  });
  const { panelHost, svgHost, canvas, slider } = shell;
  rootEl.appendChild(shell.root);

  let viewer;
  try {
    viewer = new BellowsViewer(canvas);
  } catch (_err) {
    viewer = { params: null, setFoldModel() {}, setExtension() {}, resize() {}, dispose() {} };
    const threePanel = shell.root.querySelector('.preview-panel[data-view="3d"]');
    if (threePanel) {
      const msg = document.createElement('p');
      msg.className = 'preview-unavailable';
      msg.textContent =
        '3D preview unavailable — your browser or device couldn’t create a WebGL context. The flat pattern and all exports still work.';
      threePanel.appendChild(msg);
    }
  }

  // Layer/grid/reset toolbar. doRecompute destroys + re-mounts previewApi on
  // every change, so the toolbar buttons must route through this stable proxy
  // (always forwarding to the *current* previewApi) rather than closing over one
  // instance.
  const previewProxy = {
    toggleLayer: (type) => previewApi?.toggleLayer(type),
    setGridVisible: (v) => previewApi?.setGridVisible(v),
    resetView: () => previewApi?.resetView(),
  };
  const previewToolbar = buildPreviewToolbar(previewProxy, {
    layers: [
      { type: 'CUT', label: 'Cuts' },
      { type: 'GLUE_TAB', label: 'Glue tabs' },
      { type: 'FOLD_MOUNTAIN', label: 'Mountain folds' },
      { type: 'FOLD_VALLEY', label: 'Valley folds' },
      { type: 'ENGRAVE', label: 'Engrave' },
    ],
    showGrid: true,
  });
  // Mount before svgHost so mountPreview's svgHost.innerHTML re-render never
  // wipes the toolbar (it lives in the same .preview-panel, as a sibling).
  svgHost.insertAdjacentElement('beforebegin', previewToolbar);

  // Wire slider after viewer is created so the closure resolves correctly.
  const extLabel = document.createElement('span');
  extLabel.className = 'extension-label';
  extLabel.textContent = formatExtensionLabel(Number(slider.value));
  slider.insertAdjacentElement('afterend', extLabel);

  slider.addEventListener('input', () => {
    viewer.params = params; // always push latest params before rebuilding (fix: stale-params bug)
    extension = Number(slider.value);
    extLabel.textContent = formatExtensionLabel(extension);
    viewer.setExtension(extension);
  });

  const onWindowResize = debounce(() => viewer.resize(), 150);
  window.addEventListener('resize', onWindowResize);

  const syncUrl = debounce(() => {
    history.replaceState(null, '', location.pathname + paramsToQuery(params));
  }, 250);

  function doRecompute() {
    const model = buildPatternModel(params);
    const patternSVG = renderPatternSVG(model, params);
    // Capture state before destroying so we can seed the remount.
    const prevState = previewApi?.getState();
    // Destroy before re-mounting to prevent listener accumulation.
    previewApi?.destroy();
    previewApi = mountPreview(svgHost, { patternSVG, model, params, initialState: prevState });
    if (panel) panel.setReadouts(model.metrics);
    viewer.params = params;
    viewer.setFoldModel(buildFoldModel(params, extension));
  }

  const recompute = debounce(doRecompute, 150);

  async function onExport(kind) {
    const model = buildPatternModel(params);
    if (kind === 'svg') {
      downloadBlob(makeSVGBlob(renderPatternSVG(model, params)), 'bellows-fold-pattern.svg');
    } else if (kind === 'svg-ribs') {
      downloadBlob(makeSVGBlob(renderRibLadderSVG(model, params)), 'bellows-rib-ladder.svg');
    } else if (kind === 'pdf') {
      const bytes = await exportTiledPDF(model, params);
      triggerDownload(bytes, 'bellows-pattern.pdf', 'application/pdf');
    } else if (kind === 'stl') {
      triggerDownload(exportRibsSTL(model, params), 'bellows-ribs.stl', 'model/stl');
    } else if (kind === 'stl-full') {
      triggerDownload(exportFullRibsSTL(model, params), 'bellows-ribs-full.stl', 'model/stl');
    }
  }

  panel = buildControlPanel({
    params,
    onChange(next) {
      params = next;
      syncUrl();
      recompute();
    },
    onExport,
  });
  panelHost.appendChild(panel.el);

  // Apply persisted (default-on) hints state to both header + panel.
  const hintsOn = readHintsOn();
  shell.setHintsOn(hintsOn);
  panel.setHintsOn(hintsOn);

  // Initial render
  const model = buildPatternModel(params);
  const patternSVG = renderPatternSVG(model, params);
  previewApi = mountPreview(svgHost, { patternSVG, model, params });
  panel.setReadouts(model.metrics);
  viewer.params = params;
  viewer.setFoldModel(buildFoldModel(params, extension));
}
