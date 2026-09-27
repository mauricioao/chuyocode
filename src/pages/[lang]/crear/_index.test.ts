import { describe, it, expect } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';
import CrearPage from './index.astro';

/** Render the activities start page with route params + middleware locals. */
async function render(
  url: string,
  { params, locals }: { params: Record<string, string>; locals?: Record<string, unknown> },
) {
  const container = await createContainer();
  return container.renderToResponse(CrearPage, {
    locals: { user: null, ...locals },
    params,
    request: new Request(url),
  });
}

describe('GET /[lang]/crear — routing', () => {
  it('404s for an unsupported lang segment', async () => {
    const res = await render('https://chuyocode.test/fr/crear', { params: { lang: 'fr' } });
    expect(res.status).toBe(404);
  });
});

describe('GET /[lang]/crear — anonymous gate', () => {
  it('redirects to sign-in rather than rendering the start screen', async () => {
    const res = await render('https://chuyocode.test/es/crear', { params: { lang: 'es' } });

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/es/auth/entrar?next=%2Fes%2Fcrear');
  });

  it('never ships the start-screen markup to an anonymous visitor', async () => {
    const res = await render('https://chuyocode.test/es/crear', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).not.toContain('data-testid="activity-start-island"');
  });

  it('is never publicly cacheable, even on the redirect path', async () => {
    const res = await render('https://chuyocode.test/es/crear', { params: { lang: 'es' } });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('GET /[lang]/crear — signed-in visitor', () => {
  it('renders the start screen with the picker, no moderator gate required', async () => {
    const res = await render('https://chuyocode.test/es/crear', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-testid="activity-start-island"');
    expect(html).toContain('data-testid="picker-worksheet"');
    expect(html).toContain('data-testid="picker-questions"');
  });

  it('is never publicly cacheable', async () => {
    const res = await render('https://chuyocode.test/es/crear', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});
