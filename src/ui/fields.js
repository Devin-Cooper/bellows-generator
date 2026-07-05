// src/ui/fields.js
// Central field metadata: one entry per DEFAULT_PARAMS key. Single source of
// truth for control copy (label/unit/hint) and input constraints (kind/options/
// step). Copy from the UI/UX design spec §6.

export const FIELDS = {
  type: {
    label: 'Bellows type',
    unit: '',
    hint: 'Straight (front = rear) or tapered (front ≠ rear).',
    kind: 'select',
    options: ['straight', 'tapered'],
  },
  frontW: {
    label: 'Front width',
    unit: 'mm',
    hint: 'Width of the front (lens-end) opening.',
  },
  frontH: {
    label: 'Front height',
    unit: 'mm',
    hint: 'Height of the front (lens-end) opening.',
  },
  rearW: {
    label: 'Rear width',
    unit: 'mm',
    hint: 'Width of the rear (image-end) opening; locked to front for straight bellows.',
  },
  rearH: {
    label: 'Rear height',
    unit: 'mm',
    hint: 'Height of the rear (image-end) opening; locked to front for straight bellows.',
  },
  maxDraw: {
    label: 'Working draw (extended)',
    unit: 'mm',
    hint: 'How far the bellows stretches at full extension.',
  },
  drawFactor: {
    label: 'Draw oversize',
    unit: '×',
    hint: 'Flat = this × the working draw so the folded bellows reaches it (~1.2).',
    step: 0.1,
  },
  rib: {
    label: 'Stiffener width',
    unit: 'mm',
    hint: 'Width of each rib along the draw.',
  },
  gap: {
    label: 'Gap between ribs',
    unit: 'mm',
    hint: 'The flexible fold gap (pleat hinge).',
    step: 0.1,
  },
  ribCount: {
    label: 'Rib count (auto)',
    unit: '',
    hint: 'Blank = auto-sized from the draw; enter a number to override.',
  },
  cornerAllowance: {
    label: 'Corner allowance (per side)',
    unit: 'mm',
    hint: 'Unstiffened corner zone so the 45° fold can form.',
  },
  cornerMode: {
    label: 'Corner stiffening',
    unit: '',
    hint: 'Clear = open corners (default). Interlock = complementary point-and-notch corners that nest as the tube folds — stiffer corners, whole strips only.',
    kind: 'select',
    options: ['clear', 'interlock'],
  },
  glueTab: {
    label: 'Glue tab',
    unit: 'mm',
    hint: 'Overlap flap that closes the tube.',
  },
  endMargin: {
    label: 'End margin',
    unit: 'mm',
    hint: 'Extra material at each end for mounting.',
  },
  fabricThickness: {
    label: 'Fabric thickness',
    unit: 'mm',
    hint: 'Combined inner+outer layers (for the collapse estimate).',
    step: 0.1,
  },
  ribThickness: {
    label: 'Rib thickness',
    unit: 'mm',
    hint: 'Stiffener thickness; also the STL extrusion.',
    step: 0.1,
  },
  kerf: {
    label: 'Laser kerf',
    unit: 'mm',
    hint: 'Cut width; cut paths grow outward by half this.',
    step: 0.01,
  },
  bedSize: {
    label: '3D print bed',
    unit: 'mm',
    hint: 'Print bed length; rib columns longer than this are split into bed-fitting segments.',
  },
  printOffset: {
    label: '3D print offset',
    unit: 'mm',
    hint: 'Inward shrink on printed ribs to counter over-extrusion / elephant-foot (opposite sign to the laser kerf).',
    step: 0.1,
  },
  focalLength: {
    label: 'Lens focal length',
    unit: 'mm',
    hint: 'For the magnification read-out (thin-lens approx).',
  },
  opticalOffset: {
    label: 'Optical offset',
    unit: 'mm',
    hint: 'Front standard + rear standoff + node-in-barrel, added to draw for magnification.',
  },
  bedW: {
    label: 'Laser bed width',
    unit: 'mm',
    hint: 'Cutting-bed X extent; master sheets tile across this width.',
  },
  bedH: {
    label: 'Laser bed height',
    unit: 'mm',
    hint: 'Cutting-bed Y extent; rib lattices split into bed-height segments.',
  },
};

export function fieldMeta(key) {
  return FIELDS[key] || { label: key, unit: '', hint: '' };
}
