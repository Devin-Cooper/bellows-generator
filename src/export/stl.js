import { pitch } from '../constants.js';

function writeTriangle(view, offset, nx, ny, nz, a, b, c) {
  view.setFloat32(offset, nx, true); offset += 4;
  view.setFloat32(offset, ny, true); offset += 4;
  view.setFloat32(offset, nz, true); offset += 4;
  for (const v of [a, b, c]) {
    view.setFloat32(offset, v[0], true); offset += 4;
    view.setFloat32(offset, v[1], true); offset += 4;
    view.setFloat32(offset, v[2], true); offset += 4;
  }
  view.setUint16(offset, 0, true); offset += 2;
  return offset;
}

function writeBox(view, offset, x0, x1, y0, y1, z0, z1) {
  const p = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  const tris = [
    [0, 2, 1, 0, 0, -1], [0, 3, 2, 0, 0, -1], // bottom (-z)
    [4, 5, 6, 0, 0, 1], [4, 6, 7, 0, 0, 1],   // top (+z)
    [0, 1, 5, 0, -1, 0], [0, 5, 4, 0, -1, 0], // front (-y)
    [3, 7, 6, 0, 1, 0], [3, 6, 2, 0, 1, 0],   // back (+y)
    [0, 4, 7, -1, 0, 0], [0, 7, 3, -1, 0, 0], // left (-x)
    [1, 2, 6, 1, 0, 0], [1, 6, 5, 1, 0, 0],   // right (+x)
  ];
  for (const t of tris) {
    offset = writeTriangle(view, offset, t[3], t[4], t[5], p[t[0]], p[t[1]], p[t[2]]);
  }
  return offset;
}

export function exportRibsSTL(model, params) {
  const ribCount = model.metrics.ribCount;
  const thickness = params.ribThickness;
  const width = params.rib; // rib extent along the draw axis (y)
  const length = Math.max(1, params.frontW - 2 * params.cornerAllowance); // rib span (x)
  const spacing = pitch(params); // fixed grid pitch between ribs

  const triCount = 12 * ribCount;
  const buffer = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triCount, true); // 80-byte header left as zeros

  let offset = 84;
  for (let i = 0; i < ribCount; i++) {
    const y0 = i * spacing;
    offset = writeBox(view, offset, 0, length, y0, y0 + width, 0, thickness);
  }
  return buffer;
}
