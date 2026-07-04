// tests/fixtures/photrio.js
//
// PROVENANCE (PROVISIONAL — see coherence fix): numeric fold-widths for PHOTRIO_TAPERED_A
// were derived from the same two-rib-width construction they gate, NOT yet reconciled
// against a real Photrio spreadsheet run or a printed paper fold. Reconcile and overwrite
// these numbers (and retune src/geometry/tapered.js) before relying on the tapered gate.
//
// The community "Photrio" tapered-bellows calculator spreadsheet is NOT redistributed here
// — only the outputs of the two runs below, with their exact inputs, are transcribed.
//
// Convention (per design spec): A=rear width, B=rear height, C=front width,
// D=front height, L=draw. A bellows is STRAIGHT iff C=A AND D=B.
// `width` / `height` are per-rib face fold-widths in mm, indexed rear (i=0) -> front
// (i=ribCount-1). Each fixture pins `ribCount` so N = ribCount-1 is deterministic.

export const PHOTRIO_STRAIGHT_DEGENERATE = {
  name: 'straight degenerate (C=A=160, D=B=115, L=300, 4 pleats)',
  params: {
    type: 'tapered', frontW: 160, frontH: 115, rearW: 160, rearH: 115,
    maxDraw: 300, ribCount: 5,
  },
  // C=A -> width face constant; D=B -> height face constant (trivially verifiable).
  width: [160, 160, 160, 160, 160],
  height: [115, 115, 115, 115, 115],
};

export const PHOTRIO_TAPERED_A = {
  name: 'tapered (A=200,B=150,C=100,D=80,L=250, 4 pleats)',
  params: {
    type: 'tapered', frontW: 100, frontH: 80, rearW: 200, rearH: 150,
    maxDraw: 250, ribCount: 5,
  },
  // Two-rib-width construction: interior ribs alternate web (mountain) / hinge (valley)
  // about the linear baseline, so the sequence is NOT a single monotonic interpolation.
  width: [200, 162.5, 162.5, 112.5, 100],
  height: [150, 123.75, 123.75, 88.75, 80],
};

export const PHOTRIO_FIXTURES = [PHOTRIO_STRAIGHT_DEGENERATE, PHOTRIO_TAPERED_A];
