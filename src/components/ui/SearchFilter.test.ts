import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import SearchFilter from './SearchFilter.astro';

async function render(props: Record<string, unknown>): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(SearchFilter, { props });
}

describe('SearchFilter — client mode (Libros/Noticias, unchanged)', () => {
  it('renders the default (omitted mode) as a plain filter div, not a form', async () => {
    const html = await render({ targetSelector: '[data-book-item]', emptyId: 'books-no-results', label: 'Buscar' });
    expect(html).not.toContain('<form');
    expect(html).toContain('data-mode="client"');
    expect(html).toContain('data-target="[data-book-item]"');
    expect(html).toContain('data-empty="books-no-results"');
  });

  it('renders "mode=client" explicitly the same way', async () => {
    const html = await render({ mode: 'client', targetSelector: '[data-news-item]', emptyId: 'news-no-results', label: 'Buscar' });
    expect(html).not.toContain('<form');
    expect(html).toContain('data-mode="client"');
  });

  it('the lens is a non-submitting button with tabindex -1, never open by default', async () => {
    const html = await render({ targetSelector: '[data-book-item]', emptyId: 'books-no-results', label: 'Buscar' });
    expect(html).toMatch(/<button type="button" class="chu-search-lens"[^>]*tabindex="-1"/);
    expect(html).not.toContain('is-open');
  });

  it('carries no name/value on its input — it never submits anywhere', async () => {
    const html = await render({ targetSelector: '[data-book-item]', emptyId: 'books-no-results', label: 'Buscar por título' });
    expect(html).not.toMatch(/name="q"/);
    expect(html).not.toContain('type="hidden"');
  });
});

describe('SearchFilter — server mode (community `?q=`)', () => {
  it('renders a GET form targeting `action`, role=search, input named `q` (default)', async () => {
    const html = await render({ mode: 'server', action: '/es/ingles/actividades', value: '', label: 'Buscar actividades' });
    expect(html).toMatch(/<form[^>]*method="get"[^>]*action="\/es\/ingles\/actividades"[^>]*role="search"/);
    expect(html).toMatch(/name="q"/);
  });

  it('prefills the input value and starts EXPANDED (is-open) when a value is present', async () => {
    const html = await render({ mode: 'server', action: '/es/ingles/actividades', value: 'present simple', label: 'Buscar' });
    expect(html).toMatch(/name="q" value="present simple"/);
    expect(html).toMatch(/class="chu-search[^"]*\bis-open\b[^"]*"/);
  });

  it('stays collapsed (no is-open) when the value is empty', async () => {
    const html = await render({ mode: 'server', action: '/es/ingles/actividades', value: '', label: 'Buscar' });
    expect(html).not.toContain('is-open');
  });

  it('supports a custom param name', async () => {
    const html = await render({ mode: 'server', action: '/es/x', value: 'abc', name: 'search', label: 'Buscar' });
    expect(html).toMatch(/name="search" value="abc"/);
    expect(html).not.toMatch(/name="q"/);
  });

  it('renders the lens as a real submit button (no-JS reach)', async () => {
    const html = await render({ mode: 'server', action: '/es/x', value: '', label: 'Buscar' });
    expect(html).toMatch(/<button type="submit" class="chu-search-lens"/);
  });

  it('preserves other active params as hidden inputs', async () => {
    const html = await render({
      mode: 'server',
      action: '/es/ingles/actividades',
      value: 'abc',
      label: 'Buscar',
      preserve: { nivel: 'A2', tipo: 'worksheet' },
    });
    expect(html).toMatch(/<input type="hidden" name="nivel" value="A2"/);
    expect(html).toMatch(/<input type="hidden" name="tipo" value="worksheet"/);
  });

  it('never preserves `page`, even if passed', async () => {
    const html = await render({
      mode: 'server',
      action: '/es/ingles/actividades',
      value: 'abc',
      label: 'Buscar',
      preserve: { nivel: 'A2', page: '3' },
    });
    expect(html).toMatch(/name="nivel"/);
    expect(html).not.toMatch(/name="page"/);
  });

  it('shows a clear (x) link dropping q, once a value is present, preserving the rest', async () => {
    const html = await render({
      mode: 'server',
      action: '/es/ingles/actividades',
      value: 'abc',
      label: 'Buscar',
      preserve: { nivel: 'A2' },
    });
    const match = html.match(/<a href="([^"]+)" class="chu-search-clear"/);
    expect(match).not.toBeNull();
    const href = match![1];
    expect(href).toContain('/es/ingles/actividades');
    expect(href).toContain('nivel=A2');
    expect(href).not.toContain('q=');
  });

  it('renders no clear link when the value is empty', async () => {
    const html = await render({ mode: 'server', action: '/es/ingles/actividades', value: '', label: 'Buscar' });
    expect(html).not.toContain('chu-search-clear');
  });
});
