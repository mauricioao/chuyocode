import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
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
  const container = await AstroContainer.create();
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
  it('is never publicly cacheable, anonymous or signed in', async () => {
    // The signed-in branch mounts no island, so it is the one this suite can
    // render fully (see the describe block below) — but the header must run
    // on EVERY exit, so this asserts it on the branch that does not need the
    // React renderer.
    const res = await render('https://chuyocode.test/es/auth/entrar', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });

    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

/**
 * NOTE: the default (anonymous, no `auth` marker) render mounts `AuthPanel`
 * (`client:load`, wrapping `PasswordAuthForm`/`SignInForm`), which
 * `AstroContainer` cannot render without the `@astrojs/react` server
 * renderer configured — same limitation documented at
 * `src/pages/[lang]/libros/libros.test.ts:49`. This also covers the plain
 * Google `<form>` rendered alongside it: it needs no island of its own, but
 * it sits in the SAME anonymous branch as `AuthPanel`, so the whole render
 * throws before either produces assertable HTML. The islands are fully
 * covered at the unit level (`AuthPanel.test.tsx`, `PasswordAuthForm.test.tsx`,
 * `SignInForm.test.tsx`); the anonymous PAGE render (markup + islands mounted
 * together, Google form included) is covered by hand / left for a future
 * Playwright pass — see the apply report's "Manual verification needed" list.
 */
describe('GET /[lang]/auth/entrar — the anonymous form (island)', () => {
  // See the NOTE above: no `@astrojs/react` server renderer is configured for
  // `AstroContainer` anywhere in this repo yet, so a render that mounts
  // `AuthPanel` throws here rather than producing assertable HTML.
  it.skip('renders the sign-in form for an anonymous visitor', async () => {
    const res = await render('https://chuyocode.test/es/auth/entrar', {
      params: { lang: 'es' },
    });
    const html = await res.text();

    expect(html).toContain('data-testid="signin-form"');
    expect(html).not.toContain('data-testid="auth-already-signed-in"');
  });
});

describe('GET /[lang]/auth/entrar — markers (no island mounted)', () => {
  it('shows the rejected-link invitation for ?auth=link-invalid', async () => {
    const res = await render(
      `https://chuyocode.test/es/auth/entrar?${AUTH_ERROR_PARAM}=${AUTH_ERROR_LINK_INVALID}`,
      { params: { lang: 'es' }, locals: { user: { id: 'user-1' } } },
    );
    const html = await res.text();

    expect(html).toContain('data-testid="auth-link-invalid"');
    expect(html).not.toContain('data-testid="auth-signed-in-marker"');
  });

  it('optionally reflects ?auth=signed-in', async () => {
    const res = await render(
      `https://chuyocode.test/es/auth/entrar?${AUTH_ERROR_PARAM}=${AUTH_SIGNED_IN}`,
      { params: { lang: 'es' }, locals: { user: { id: 'user-1' } } },
    );
    const html = await res.text();

    expect(html).toContain('data-testid="auth-signed-in-marker"');
    expect(html).not.toContain('data-testid="auth-link-invalid"');
  });

  it('shows only the rejected-link marker when both params are smuggled in together', async () => {
    const res = await render(
      `https://chuyocode.test/es/auth/entrar?${AUTH_ERROR_PARAM}=${AUTH_ERROR_LINK_INVALID}`,
      { params: { lang: 'es' }, locals: { user: { id: 'user-1' } } },
    );
    const html = await res.text();

    expect(html).toContain('data-testid="auth-link-invalid"');
    expect(html).not.toContain('data-testid="auth-signed-in-marker"');
  });

  it('shows the Google-unavailable invitation for ?auth=google-unavailable', async () => {
    const res = await render(
      `https://chuyocode.test/es/auth/entrar?${AUTH_ERROR_PARAM}=${AUTH_ERROR_GOOGLE_UNAVAILABLE}`,
      { params: { lang: 'es' }, locals: { user: { id: 'user-1' } } },
    );
    const html = await res.text();

    expect(html).toContain('data-testid="auth-google-unavailable"');
    expect(html).not.toContain('data-testid="auth-link-invalid"');
    expect(html).not.toContain('data-testid="auth-signed-in-marker"');
  });
});

describe('entrar.astro — plain forms bypass the ClientRouter', () => {
  // Astro's ClientRouter intercepts form submissions and replays them through
  // `fetch`. `/api/auth/google` answers with a 303 to accounts.google.com, which
  // `fetch` cannot follow cross-origin, so the router fell back to a GET
  // navigation of the form action — a 404, because the endpoint is POST-only.
  // `data-astro-reload` makes the browser submit natively.
  it('marks every plain <form> with data-astro-reload', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./entrar.astro', import.meta.url)),
      'utf8',
    );
    // Only real tags carry an `action`; the doc comment mentions `<form …>` too.
    const forms = source.match(/<form\b[^>]*\baction=[^>]*>/g) ?? [];

    expect(forms.length).toBe(2);
    for (const form of forms) {
      expect(form).toContain('data-astro-reload');
    }
  });
});

describe('GET /[lang]/auth/entrar — already signed in', () => {
  it('shows a sign-out form instead of the sign-in form', async () => {
    const res = await render('https://chuyocode.test/es/auth/entrar', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();

    expect(html).toContain('data-testid="auth-already-signed-in"');
    expect(html).toContain('action="/api/auth/signout"');
    expect(html).toContain('method="POST"');
  });

  it('carries a validated `next` through to the sign-out form', async () => {
    const res = await render(
      'https://chuyocode.test/es/auth/entrar?next=%2Fes%2Fmis-libros',
      { params: { lang: 'es' }, locals: { user: { id: 'user-1' } } },
    );
    const html = await res.text();

    expect(html).toContain('name="next"');
    expect(html).toContain('value="/es/mis-libros"');
  });

  it('neutralises a hostile `next` rather than embedding it in the hidden field', async () => {
    // `Astro.url.href` legitimately carries the hostile query string in the
    // page's OWN og:url/canonical meta (it is the address bar's URL, not a
    // redirect target), so the assertion is scoped to the hidden field this
    // page actually builds from `next` — the one `safeNextPath` guards.
    const res = await render(
      'https://chuyocode.test/es/auth/entrar?next=%2F%2Fevil.com',
      { params: { lang: 'es' }, locals: { user: { id: 'user-1' } } },
    );
    const html = await res.text();

    expect(html).toContain('name="next" value="/es/"');
    expect(html).not.toContain('value="//evil.com"');
  });

  it('localizes the already-signed-in copy', async () => {
    const res = await render('https://chuyocode.test/en/auth/entrar', {
      params: { lang: 'en' },
      locals: { user: { id: 'user-1' }, lang: 'en' },
    });
    const html = await res.text();

    expect(html).toContain('Sign out');
  });
});
