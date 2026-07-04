# bellows-generator

A browser-based, parametric **camera bellows generator**. Runs entirely client-side,
hosted statically on GitHub Pages. Dial in bellows parameters and preview the result as
a flat fold pattern and an interactive folded 3D model, then export production files
(SVG, PDF, STL). All geometry is in millimetres.

## Develop

```bash
npm install
npm run dev      # local dev server at http://localhost:5173/
npm run build    # production build into dist/
npm run preview  # serve the built dist/
npm test         # run the Vitest suite once
```

## License

MIT — see [LICENSE](./LICENSE). Bundled third-party licenses are generated into
`THIRD_PARTY_NOTICES.md` at build time.
