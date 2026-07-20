import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import Button from './Button.astro';

// Spec 7 — Scenario: Button variants.
// Renders Button.astro through Astro's server Container API and asserts the
// correct Tailwind variant classes and element type are produced.
describe('Button.astro', () => {
  it('applies primary variant Tailwind classes', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Button, {
      props: { variant: 'primary' },
      slots: { default: 'Click me' },
    });
    expect(html).toContain('bg-orange-600');
    expect(html).toContain('text-white');
    expect(html).toContain('hover:bg-orange-700');
    expect(html).toContain('Click me');
  });

  it('applies secondary variant Tailwind classes', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Button, {
      props: { variant: 'secondary' },
      slots: { default: 'Secondary' },
    });
    expect(html).toContain('border-orange-600');
    expect(html).toContain('bg-transparent');
    expect(html).toContain('text-orange-600');
    expect(html).not.toContain('bg-orange-600 text-white');
  });

  it('defaults to the primary variant', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Button, {
      slots: { default: 'Default' },
    });
    expect(html).toContain('bg-orange-600');
  });

  it('renders a <button> when no href is provided', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Button, {
      props: { variant: 'primary' },
      slots: { default: 'Btn' },
    });
    expect(html).toMatch(/<button/);
    expect(html).not.toMatch(/<a\s/);
  });

  it('renders an <a> when href is provided', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Button, {
      props: { variant: 'primary', href: '/es/' },
      slots: { default: 'Link' },
    });
    expect(html).toMatch(/<a\s/);
    expect(html).toContain('href="/es/"');
  });

  it('uses no inline style attributes (Tailwind-only)', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Button, {
      props: { variant: 'secondary' },
      slots: { default: 'NoStyle' },
    });
    expect(html).not.toMatch(/style=/);
  });
});
