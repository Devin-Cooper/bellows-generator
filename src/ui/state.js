import { paramsFromQuery, paramsToQuery } from '../params.js';
import { buildPatternModel, buildFoldModel } from '../geometry/index.js';
import { renderPatternSVG } from '../render/svg.js';
import { BellowsViewer } from '../render/three.js';
import { buildControlPanel } from './controls.js';

export function debounce(fn, ms) {
  let id;
  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), ms);
  };
}

export function initApp(rootEl) {
  let params = paramsFromQuery(location.search);
  const extension = 1;
  let panel;

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
  previewHost.append(svgHost, canvas);
  layout.append(panelHost, previewHost);
  rootEl.appendChild(layout);

  const viewer = new BellowsViewer(canvas);

  const syncUrl = debounce(() => {
    history.replaceState(null, '', location.pathname + paramsToQuery(params));
  }, 250);

  const recompute = debounce(() => {
    const model = buildPatternModel(params);
    svgHost.innerHTML = renderPatternSVG(model, params);
    if (panel) panel.setReadouts(model.metrics);
    viewer.setFoldModel(buildFoldModel(params, extension));
  }, 150);

  panel = buildControlPanel({
    params,
    onChange(next) {
      params = next;
      syncUrl();
      recompute();
    },
  });
  panelHost.appendChild(panel.el);

  const model = buildPatternModel(params);
  svgHost.innerHTML = renderPatternSVG(model, params);
  panel.setReadouts(model.metrics);
  viewer.setFoldModel(buildFoldModel(params, extension));
}
