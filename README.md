# Bellows Generator

A browser-based, client-side **parametric camera-bellows generator**. Dial in the
openings, draw, pleat pitch and material, then preview the result as a flat fold
pattern **and** an interactive folded 3D model, and export production files
(fold-pattern SVG, stiffener rib-ladder SVG, tiled PDF, rib STL). Everything runs in
the browser — nothing is uploaded. All geometry is in millimetres.

Supports **straight** (parallel, front = rear) and **tapered** (front opening ≠ rear
opening) bellows.

## Develop & run

Requires Node >= 20.19.

```bash
npm install
npm run dev      # local dev server at http://localhost:5173/
npm test         # vitest run (geometry + renderer + export unit tests)
npm run build    # production build into dist/ (base = /bellows-generator/)
npm run preview  # serve the production build locally
```

The app is deployed statically to GitHub Pages via `.github/workflows/deploy.yml`.

## "150 mm lens → A6 scanner" preset

One click loads the author's build (`A6_PRESET`): a straight bellows with a **160 × 115 mm**
rectangular cross-section (clears A6's 148 mm and 105 mm axes with margin), 300 mm target
draw, 12 mm ribs / 2.5 mm gaps, 15 mm per-side corner allowance, 10 mm glue tab, 35 mm end
margins, 150 mm focal length. Parameters also hydrate from the URL query string, so shared
links restore the full design.

## Laser color → operation table

Each segment type carries an explicit stroke color pinned to a LightBurn-palette hex (the
load-bearing contract). LightBurn keys on stroke color; Inkscape reads the matching
`<g inkscape:groupmode="layer">` groups.

| Type            | Color   | Hex       | Operation                                  |
|-----------------|---------|-----------|--------------------------------------------|
| `CUT`           | red     | `#FF0000` | cut (outer boundary + rib outlines)        |
| `GLUE_TAB`      | magenta | `#FF00FF` | cut (closing-seam glue tab)                |
| `FOLD_MOUNTAIN` | blue    | `#0000FF` | score — mountain fold                      |
| `FOLD_VALLEY`   | green   | `#00AA00` | score — valley fold                        |
| `ENGRAVE`       | black   | `#000000` | engrave — rib footprints / registration    |

`CUT` and `GLUE_TAB` paths are grown outward by `kerf/2`; fold and engrave lines are never
offset. A `kerf ≥ gap` warning fires when the kerf would eat the inter-rib gap.

## Credits & prior art

- **Standard Cameras** and **René Smets** — public write-ups on bellows form factor,
  mid-face closing seams, and mountain/valley phase informed the straight construction.
- **Bardell / Photrio bellows calculator** — the tapered flat-development method and the
  numeric cross-check fixtures. The Photrio spreadsheet is **not** redistributed; only the
  numeric outputs of specific runs are recorded (see `tests/fixtures/photrio.js`).
- **PyBellows** — framed as **prior-art inspiration only**. No PyBellows code is used
  (so its CC BY-NC terms are never invoked); only paraphrased, uncopyrightable facts and
  formulas were reimplemented from public descriptions.

**Tapered bellows are experimental.** The per-rib fold widths are validated only against
*provisional* Photrio cross-check fixtures (`tests/fixtures/photrio.js`) that were
self-derived, not yet reconciled against the real Photrio spreadsheet or a printed paper
fold; and the tapered flat *outline* (corner miters) is structural for preview/export
rather than a proven fold. **Paper-fold-test any tapered pattern before cutting**, and
reconcile the fixtures against ground truth before relying on it. Straight bellows are the
validated path.

## License

MIT — see `LICENSE`. Bundled runtime dependencies (Three.js, pdf-lib) and their notices
are listed in the generated `THIRD_PARTY_NOTICES.md`.
