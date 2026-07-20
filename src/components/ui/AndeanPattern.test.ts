import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import AndeanPattern from './AndeanPattern.astro';

// PR 2 (visual-identity) — design decision #3.
// AndeanPattern is a pure Astro component (no client island), so the Container
// API renders it fully. It must be decorative-only and honor the caller API.
describe('AndeanPattern.astro', () => {
  it('renders a decorative, aria-hidden wrapper', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(AndeanPattern, {});
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('andean-pattern');
  });

  it('is non-interactive (pointer-events-none)', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(AndeanPattern, {});
    expect(html).toContain('pointer-events-none');
  });

  it('merges caller-supplied classes (color token API)', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(AndeanPattern, {
      props: { class: 'text-terracotta' },
    });
    expect(html).toContain('text-terracotta');
    // still keeps its own base classes
    expect(html).toContain('andean-pattern');
  });

  it('uses no inline style attributes (Tailwind/token-driven only)', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(AndeanPattern, {});
    expect(html).not.toMatch(/style=/);
  });
});
