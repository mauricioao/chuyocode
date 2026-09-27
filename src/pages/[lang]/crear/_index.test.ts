import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import CrearPage from './index.astro';

/** Render the new-exercise page with route params + middleware locals. */
async function render(
  url: string,
  { params, locals }: { params: Record<string, string>; locals?: Record<string, unknown> },
) {
  const container = await AstroContainer.create();
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

describe('GET /[lang]/crear — anonymous gate (task 15.1 / T6)', () => {
  it('redirects to sign-in rather than rendering the authoring markup', async () => {
    const res = await render('https://chuyocode.test/es/crear', { params: { lang: 'es' } });

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/es/auth/entrar?next=%2Fes%2Fcrear');
  });

  it('never ships authoring markup to an anonymous visitor', async () => {
    const res = await render('https://chuyocode.test/es/crear', { params: { lang: 'es' } });
    const html = await res.text();

    expect(html).not.toContain('data-testid="exercise-author-island"');
    expect(html).not.toContain('data-testid="add-row-block"');
  });

  it('is never publicly cacheable, even on the redirect path', async () => {
    const res = await render('https://chuyocode.test/es/crear', { params: { lang: 'es' } });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

/**
 * NOTE: the authenticated branch mounts `ExerciseAuthorIsland` (`client:load`),
 * which `AstroContainer` cannot render without the `@astrojs/react` server
 * renderer configured — the same documented limitation as
 * `src/pages/[lang]/auth/entrar.test.ts`. The island itself is fully covered
 * at the unit level (`ExerciseAuthorIsland.test.tsx` and its siblings); the
 * authenticated PAGE render (markup + island mounted together) is left for a
 * manual/Playwright pass — see the apply report.
 */
describe.skip('GET /[lang]/crear — the authoring form (island, needs @astrojs/react in AstroContainer)', () => {
  it('renders the authoring island for a signed-in visitor', async () => {
    const res = await render('https://chuyocode.test/es/crear', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="exercise-author-island"');
  });
});
