import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';
import { DEFAULT_LANG } from '@lib/i18n';
import {
  AUTH_ERROR_PARAM,
  AUTH_ERROR_LINK_INVALID,
  AUTH_ERROR_GOOGLE_UNAVAILABLE,
  AUTH_SIGNED_IN,
} from '@lib/authRedirect';
import EntrarPage from './entrar.astro';

/** Render the sign-in page with route params + middleware locals. */
async function render(
  url: string,
  { params, locals }: { params: Record<string, string>; locals?: Record<string, unknown> },
) {
  const container = await createContainer();
  return container.renderToResponse(EntrarPage, {
    // `App.Locals.user` is required, never optional — anonymous by default,
    // same convention as `src/pages/[lang]/libros/libros.test.ts`.
    locals: { user: null, ...locals },
    params,
    request: new Request(url),
  });
}

describe('GET /[lang]/auth/entrar — routing', () => {
  it('404s for an unsupported lang segment', async () => {
    const res = await render('https://chuyocode.test/fr/auth/entrar', {
      params: { lang: 'fr' },
    });

    expect(res.status).toBe(404);
  });
});

describe('GET /[lang]/auth/entrar — response mechanics', () => {
  it('is never publicly cacheable for an anonymous visitor', async () => {
    const res = await render('https://chuyocode.test/es/auth/entrar', {
      params: { lang: 'es' },
    });

    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('is never publicly cacheable for the signed-in redirect either', async () => {
    const res = await render('https://chuyocode.test/es/auth/entrar', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });

    expect(res.status).toBe(303);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('GET /[lang]/auth/entrar — signed-in visitors are never shown this page', () => {
  it('303s to /<lang>/ with the signed-in marker when no next was given', async () => {
    const res = await render('https://chuyocode.test/es/auth/entrar', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(
      `/es/?${AUTH_ERROR_PARAM}=${AUTH_SIGNED_IN}`,
    );
  });

  it('303s to the validated next, still carrying the signed-in marker', async () => {
    const res = await render(
      'https://chuyocode.test/es/auth/entrar?next=%2Fes%2Fmis-libros',
      { params: { lang: 'es' }, locals: { user: { id: 'user-1' } } },
    );

    expect(res.headers.get('location')).toBe(
      `/es/mis-libros?${AUTH_ERROR_PARAM}=${AUTH_SIGNED_IN}`,
    );
  });

  it('neutralises a hostile next rather than redirecting to it', async () => {
    const res = await render(
      'https://chuyocode.test/es/auth/entrar?next=%2F%2Fevil.com',
      { params: { lang: 'es' }, locals: { user: { id: 'user-1' } } },
    );

    expect(res.headers.get('location')).toBe(
      `/${DEFAULT_LANG}/?${AUTH_ERROR_PARAM}=${AUTH_SIGNED_IN}`,
    );
  });

  it('never redirects a signed-in visitor back to this same page', async () => {
    // `safeNextPath`'s auth-page guard closes this: a `next` that pointed
    // back at `/auth/entrar` would otherwise be an infinite loop.
    const res = await render(
      'https://chuyocode.test/es/auth/entrar?next=%2Fes%2Fauth%2Fentrar',
      { params: { lang: 'es' }, locals: { user: { id: 'user-1' } } },
    );

    expect(res.headers.get('location')).toBe(
      `/${DEFAULT_LANG}/?${AUTH_ERROR_PARAM}=${AUTH_SIGNED_IN}`,
    );
  });

  it('always carries a query string, defeating a query-less Location (Netlify)', async () => {
    const res = await render('https://chuyocode.test/es/auth/entrar', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });

    expect(res.headers.get('location')).toContain('?');
  });

  it('localizes the redirect target to the requested locale', async () => {
    const res = await render('https://chuyocode.test/en/auth/entrar', {
      params: { lang: 'en' },
      locals: { user: { id: 'user-1' }, lang: 'en' },
    });

    expect(res.headers.get('location')).toBe(
      `/en/?${AUTH_ERROR_PARAM}=${AUTH_SIGNED_IN}`,
    );
  });
});

describe('GET /[lang]/auth/entrar — the anonymous form', () => {
  it('renders the sign-in form for an anonymous visitor', async () => {
    const res = await render('https://chuyocode.test/es/auth/entrar', {
      params: { lang: 'es' },
    });
    const html = await res.text();

    expect(html).toContain('data-testid="password-auth-form"');
    expect(html).toContain('data-testid="google-signin-form"');
  });

  it('never renders the magic-link form (hidden for now)', async () => {
    const res = await render('https://chuyocode.test/es/auth/entrar', {
      params: { lang: 'es' },
    });
    const html = await res.text();

    expect(html).not.toContain('data-testid="signin-form"');
    expect(html).not.toContain('data-testid="auth-panel-toggle"');
  });
});

describe('GET /[lang]/auth/entrar — markers', () => {
  it('shows the rejected-link invitation for ?auth=link-invalid', async () => {
    const res = await render(
      `https://chuyocode.test/es/auth/entrar?${AUTH_ERROR_PARAM}=${AUTH_ERROR_LINK_INVALID}`,
      { params: { lang: 'es' } },
    );
    const html = await res.text();

    expect(html).toContain('data-testid="auth-link-invalid"');
    expect(html).not.toContain('data-testid="auth-signed-in-marker"');
  });

  it('optionally reflects ?auth=signed-in', async () => {
    const res = await render(
      `https://chuyocode.test/es/auth/entrar?${AUTH_ERROR_PARAM}=${AUTH_SIGNED_IN}`,
      { params: { lang: 'es' } },
    );
    const html = await res.text();

    expect(html).toContain('data-testid="auth-signed-in-marker"');
    expect(html).not.toContain('data-testid="auth-link-invalid"');
  });

  it('shows only the rejected-link marker when both params are smuggled in together', async () => {
    const res = await render(
      `https://chuyocode.test/es/auth/entrar?${AUTH_ERROR_PARAM}=${AUTH_ERROR_LINK_INVALID}`,
      { params: { lang: 'es' } },
    );
    const html = await res.text();

    expect(html).toContain('data-testid="auth-link-invalid"');
    expect(html).not.toContain('data-testid="auth-signed-in-marker"');
  });

  it('shows the Google-unavailable invitation for ?auth=google-unavailable', async () => {
    const res = await render(
      `https://chuyocode.test/es/auth/entrar?${AUTH_ERROR_PARAM}=${AUTH_ERROR_GOOGLE_UNAVAILABLE}`,
      { params: { lang: 'es' } },
    );
    const html = await res.text();

    expect(html).toContain('data-testid="auth-google-unavailable"');
    expect(html).not.toContain('data-testid="auth-link-invalid"');
    expect(html).not.toContain('data-testid="auth-signed-in-marker"');
  });
});

describe('entrar.astro — ?mode=signup (header create-account button hint)', () => {
  it('reads ?mode=signup and forwards it to AuthPanel as initialMode', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./entrar.astro', import.meta.url)),
      'utf8',
    );

    expect(source).toContain("searchParams.get('mode')");
    expect(source).toMatch(/<AuthPanel[^>]*initialMode={initialMode}/);
  });
});

describe('entrar.astro — plain forms bypass the ClientRouter', () => {
  // Astro's ClientRouter intercepts form submissions and replays them through
  // `fetch`. `/api/auth/google` answers with a 303 to accounts.google.com, which
  // `fetch` cannot follow cross-origin, so the router fell back to a GET
  // navigation of the form action — a 404, because the endpoint is POST-only.
  // `data-astro-reload` makes the browser submit natively.
  it('marks the plain <form> with data-astro-reload', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./entrar.astro', import.meta.url)),
      'utf8',
    );
    // Only real tags carry an `action`; the doc comment mentions `<form …>` too.
    const forms = source.match(/<form\b[^>]*\baction=[^>]*>/g) ?? [];

    expect(forms.length).toBe(1);
    for (const form of forms) {
      expect(form).toContain('data-astro-reload');
    }
  });
});

describe('entrar.astro — Google button', () => {
  it('renders the official multicolor "G" mark, not a monochrome icon', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./entrar.astro', import.meta.url)),
      'utf8',
    );

    for (const color of ['#4285F4', '#34A853', '#FBBC05', '#EA4335']) {
      expect(source).toContain(color);
    }
  });

  it('hides the logo from assistive tech, keeping the text label as the accessible name', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./entrar.astro', import.meta.url)),
      'utf8',
    );
    const svgOpenTag = source.match(/<svg\b[^>]*>/)?.[0] ?? '';

    expect(svgOpenTag).toContain('aria-hidden="true"');
  });
});
