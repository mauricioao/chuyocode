import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import NuevaClavePage from './nueva-clave.astro';

async function render(
  url: string,
  { params, locals }: { params: Record<string, string>; locals?: Record<string, unknown> },
) {
  const container = await AstroContainer.create();
  return container.renderToResponse(NuevaClavePage, {
    locals: { user: null, ...locals },
    params,
    request: new Request(url),
  });
}

describe('GET /[lang]/auth/nueva-clave — routing', () => {
  it('404s for an unsupported lang segment', async () => {
    const res = await render('https://chuyocode.test/fr/auth/nueva-clave', {
      params: { lang: 'fr' },
    });

    expect(res.status).toBe(404);
  });
});

describe('GET /[lang]/auth/nueva-clave — requires a session', () => {
  it('redirects an anonymous visitor to sign in, with next back to this page', async () => {
    const res = await render('https://chuyocode.test/es/auth/nueva-clave', {
      params: { lang: 'es' },
    });

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(
      '/es/auth/entrar?next=%2Fes%2Fauth%2Fnueva-clave',
    );
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('redirects in the requested locale', async () => {
    const res = await render('https://chuyocode.test/en/auth/nueva-clave', {
      params: { lang: 'en' },
    });

    expect(res.headers.get('location')).toBe(
      '/en/auth/entrar?next=%2Fen%2Fauth%2Fnueva-clave',
    );
  });
});

// NOTE: the signed-in branch mounts `NuevaClaveForm` (`client:load`), which
// `AstroContainer` cannot render without the `@astrojs/react` server
// renderer configured — same documented limitation as
// `src/pages/[lang]/crear/index.test.ts` and `entrar.test.ts`. The island
// itself is fully covered at the unit level by
// `src/components/islands/NuevaClaveForm.test.tsx`.
describe.skip('GET /[lang]/auth/nueva-clave — signed in (island, needs @astrojs/react in AstroContainer)', () => {
  it('is never publicly cacheable', async () => {
    const res = await render('https://chuyocode.test/es/auth/nueva-clave', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });

    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.status).toBe(200);
  });
});
