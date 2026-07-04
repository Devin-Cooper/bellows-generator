// src/ui/controls.js
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
