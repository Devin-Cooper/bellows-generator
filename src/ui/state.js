import { paramsFromQuery, paramsToQuery } from '../params.js';
import { buildPatternModel, buildFoldModel } from '../geometry/index.js';
import { renderPatternSVG, renderRibLadderSVG } from '../render/svg.js';
import { BellowsViewer } from '../render/three.js';
import { buildControlPanel } from './controls.js';
import { mountPreview } from './preview.js';
import { makeSVGBlob, downloadBlob, triggerDownload } from '../export/download.js';
import { exportTiledPDF } from '../export/pdf.js';
import { exportRibsSTL } from '../export/stl.js';

export function debounce(fn, ms) {
  let id;
  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), ms);
  };
}

export function initApp(rootEl) {
  let params = paramsFromQuery(location.search);
  let extension = 1;
  let panel;
  let previewApi = null;

  const layout = document.createElement('div');
  layout.className = 'app';
  const panelHost = document.createElement('div');
  panelHost.className = 'panel';
  const previewHost = document.createElement('div');
  previewHost.className = 'preview';
  const svgHost = document.createElement('div');
  svgHost.className = 'flat-preview';
  const canvas = document.createElement('canvas');
  canvas.className = 'three-canvas';

  // Collapse/extend slider (spec §7)
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '1';
  slider.step = '0.01';
  slider.value = '1';

  previewHost.append(svgHost, canvas, slider);
  layout.append(panelHost, previewHost);
  rootEl.appendChild(layout);

  const viewer = new BellowsViewer(canvas);

  // Wire slider after viewer is created so the closure resolves correctly
  slider.addEventListener('input', () => {
    viewer.params = params; // always push the latest params before rebuilding (fix: stale-params bug)
    extension = Number(slider.value);
    viewer.setExtension(extension);
  });

  const syncUrl = debounce(() => {
    history.replaceState(null, '', location.pathname + paramsToQuery(params));
  }, 250);

  function doRecompute() {
    const model = buildPatternModel(params);
    const patternSVG = renderPatternSVG(model, params);
    // Destroy before re-mounting to prevent listener accumulation (Task 18 contract)
    previewApi?.destroy();
    previewApi = mountPreview(svgHost, { patternSVG, model, params });
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

  // Initial render
  const model = buildPatternModel(params);
  const patternSVG = renderPatternSVG(model, params);
  previewApi = mountPreview(svgHost, { patternSVG, model, params });
  panel.setReadouts(model.metrics);
  viewer.params = params;
  viewer.setFoldModel(buildFoldModel(params, extension));
}
