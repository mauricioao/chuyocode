import { describe, expect, it } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import SectionHeading from './SectionHeading.astro';

async function render(props: Record<string, unknown>, slots: Record<string, string> = {}): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(SectionHeading, { props, slots });
}

describe('SectionHeading.astro', () => {
  it('renders the title inside a real <h2>, not a muted caption', async () => {
    const html = await render({ title: 'Para ti hoy' });
    expect(html).toMatch(/<h2[^>]*>[\s\S]*Para ti hoy[\s\S]*<\/h2>/);
    expect(html).not.toContain('uppercase');
  });

  it('renders the accent bar next to the heading text', async () => {
    const html = await render({ title: 'Ir directo a tu nivel' });
    expect(html).toContain('bg-accent');
    expect(html).toContain('rounded-full');
  });

  it('carries generous top spacing and smaller bottom spacing', async () => {
    const html = await render({ title: 'Elegir nivel' });
    expect(html).toContain('mt-12');
    expect(html).toContain('mb-4');
  });

  it('forwards the id to the <h2> for aria-labelledby pairing', async () => {
    const html = await render({ title: 'Para ti hoy', id: 'hub-today-heading' });
    expect(html).toMatch(/<h2 id="hub-today-heading"/);
  });

  it('omits the description paragraph when none is given', async () => {
    const html = await render({ title: 'Elegir nivel' });
    expect(html).not.toContain('<p');
  });

  it('renders the description when given', async () => {
    const html = await render({ title: 'Elegir nivel', description: 'Elige tu punto de partida' });
    expect(html).toContain('Elige tu punto de partida');
  });

  it('renders the action slot content', async () => {
    const html = await render(
      { title: 'Actividades' },
      { action: '<a href="/todas">Ver todas</a>' },
    );
    expect(html).toContain('Ver todas');
  });
});
