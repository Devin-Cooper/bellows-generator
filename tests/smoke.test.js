import { describe, it, expect } from 'vitest';

describe('toolchain smoke', () => {
  it('executes ESM and evaluates assertions under vitest', () => {
    const sum = (a, b) => a + b;
    expect(sum(2, 2)).toBe(4);
  });
});
