// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('index.html document metadata', () => {
  const html = () => readFileSync('index.html', 'utf8');

  it('has a descriptive title and a description meta tag', () => {
    const doc = new DOMParser().parseFromString(html(), 'text/html');
    const title = doc.querySelector('title')?.textContent ?? '';
    expect(title.length).toBeGreaterThan('Bellows Generator'.length);
    expect(title.toLowerCase()).toContain('bellows');

    const desc = doc.querySelector('meta[name="description"]');
    expect(desc).not.toBeNull();
    expect((desc.getAttribute('content') ?? '').length).toBeGreaterThan(20);
  });

  it('preserves the app mount point and module entry', () => {
    const doc = new DOMParser().parseFromString(html(), 'text/html');
    expect(doc.querySelector('#app')).not.toBeNull();
    expect(doc.querySelector('script[type="module"]')?.getAttribute('src'))
      .toBe('/src/main.js');
  });
});
