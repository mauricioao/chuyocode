import { describe, it, expect } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';
import BackButton from './BackButton.astro';

async function render(props: Record<string, unknown>): Promise<string> {
  const container = await createContainer();
  return container.renderToString(BackButton, { props });
}

describe('BackButton.astro', () => {
  it('is a real <a href> to the given parent route', async () => {
    const html = await render({ lang: 'es', href: '/es/libros' });
    expect(html).toContain('href="/es/libros"');
    expect(html).toContain('data-back-button');
  });

  it('has the glass floating look: translucent blur surface + hairline border + floating shadow', async () => {
    const html = await render({ lang: 'es', href: '/es' });
    expect(html).toContain('glass-floating');
    expect(html).toContain('ring-1');
    expect(html).toContain('shadow-(--shadow-floating)');
  });

  it('uses the accent-colored Phosphor icon at bold weight, not a filled yellow circle', async () => {
    const html = await render({ lang: 'es', href: '/es' });
    expect(html).toContain('text-accent');
    // No longer the old solid brand-yellow fill.
    expect(html).not.toContain('bg-primary');
  });

  it('keeps the localized accessible label and tooltip', async () => {
    const html = await render({ lang: 'es', href: '/es' });
    expect(html).toContain('aria-label="Volver"');
    const en = await render({ lang: 'en', href: '/en' });
    expect(en).toContain('aria-label="Back"');
  });
});
