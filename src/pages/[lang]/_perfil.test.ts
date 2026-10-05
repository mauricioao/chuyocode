/**
 * GET /[lang]/perfil tests (T3): the gate (redirect/404), noindex, every
 * section renders, and the Google-only password variant. `toProfile`
 * (`@lib/profile`) is mocked — its OWN resolution rules are covered by
 * `profile.test.ts`; this file only proves the ROUTE's own decisions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';
import type { Profile } from '@/lib/profile';

const { profileResult } = vi.hoisted(() => ({
  profileResult: {
    value: {
      name: 'Juan Perez',
      email: 'juan@example.com',
      avatarUrl: null,
      initials: 'JP',
      plan: 'free',
      isModerator: false,
      moderationPendingCount: 0,
    } as Profile,
  },
}));

vi.mock('@lib/profile', () => ({
  toProfile: vi.fn(async () => profileResult.value),
}));

import PerfilPage from './perfil.astro';

const EMAIL_USER = { id: 'user-1', email: 'juan@example.com', identities: [{ provider: 'email' }] };
const GOOGLE_USER = { id: 'user-2', email: 'juan@gmail.com', identities: [{ provider: 'google' }] };

async function render(
  url: string,
  { params, locals }: { params: Record<string, string>; locals?: Record<string, unknown> },
) {
  const container = await createContainer();
  return container.renderToResponse(PerfilPage, {
    locals: { user: null, ...locals } as unknown as App.Locals,
    params,
    request: new Request(url),
  });
}

beforeEach(() => {
  profileResult.value = {
    name: 'Juan Perez',
    email: 'juan@example.com',
    avatarUrl: null,
    initials: 'JP',
    plan: 'free',
    isModerator: false,
    moderationPendingCount: 0,
  };
});

describe('GET /[lang]/perfil — routing', () => {
  it('404s for an unsupported lang segment', async () => {
    const res = await render('https://chuyocode.test/fr/perfil', { params: { lang: 'fr' } });
    expect(res.status).toBe(404);
  });
});

describe('GET /[lang]/perfil — anonymous gate', () => {
  it('redirects to sign-in with next pointing back here', async () => {
    const res = await render('https://chuyocode.test/es/perfil', { params: { lang: 'es' } });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/es/auth/entrar?next=%2Fes%2Fperfil');
  });

  it('never ships the profile sections to an anonymous visitor', async () => {
    const res = await render('https://chuyocode.test/es/perfil', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).not.toContain('data-testid="profile-name-section"');
    expect(html).not.toContain('data-testid="profile-danger-zone"');
  });

  it('is never publicly cacheable, even on the redirect path', async () => {
    const res = await render('https://chuyocode.test/es/perfil', { params: { lang: 'es' } });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('GET /[lang]/perfil — signed-in visitor (email/password account)', () => {
  it('renders every section', async () => {
    const res = await render('https://chuyocode.test/es/perfil', {
      params: { lang: 'es' },
      locals: { user: EMAIL_USER },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-testid="profile-name-section"');
    expect(html).toContain('data-testid="profile-email-section"');
    expect(html).toContain('data-testid="profile-password-section"');
    expect(html).toContain('data-testid="profile-plan-section"');
    expect(html).toContain('data-testid="profile-danger-zone"');
  });

  it('shows the resolved email, read-only', async () => {
    const res = await render('https://chuyocode.test/es/perfil', {
      params: { lang: 'es' },
      locals: { user: EMAIL_USER },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="profile-email-value"');
    expect(html).toContain('juan@example.com');
  });

  it('passes the resolved name to ProfileNameForm as initialName', async () => {
    const res = await render('https://chuyocode.test/es/perfil', {
      params: { lang: 'es' },
      locals: { user: EMAIL_USER },
    });
    const html = await res.text();
    expect(html).toContain('&quot;initialName&quot;:[0,&quot;Juan Perez&quot;]');
  });

  it('mounts the password change form, not the Google-only note', async () => {
    const res = await render('https://chuyocode.test/es/perfil', {
      params: { lang: 'es' },
      locals: { user: EMAIL_USER },
    });
    const html = await res.text();
    expect(html).not.toContain('data-testid="profile-password-google-only"');
  });

  it('shows the Free badge by default, and links to /[lang]/premium', async () => {
    const res = await render('https://chuyocode.test/es/perfil', {
      params: { lang: 'es' },
      locals: { user: EMAIL_USER },
    });
    const html = await res.text();
    const badge = html.match(/data-testid="profile-plan-badge"[^>]*>([^<]*)</);
    expect(badge?.[1]?.trim()).toBe('Free');
    expect(html).toContain('href="/es/premium"');
  });

  it('shows the Premium badge for a premium plan', async () => {
    profileResult.value = { ...profileResult.value, plan: 'premium' };
    const res = await render('https://chuyocode.test/es/perfil', {
      params: { lang: 'es' },
      locals: { user: EMAIL_USER },
    });
    const html = await res.text();
    const badge = html.match(/data-testid="profile-plan-badge"[^>]*>([^<]*)</);
    expect(badge?.[1]?.trim()).toBe('Premium');
  });

  it('is never publicly cacheable', async () => {
    const res = await render('https://chuyocode.test/es/perfil', {
      params: { lang: 'es' },
      locals: { user: EMAIL_USER },
    });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('carries noindex (perfil is now in @lib/seo\'s NOINDEX_SECTIONS)', async () => {
    const res = await render('https://chuyocode.test/es/perfil', {
      params: { lang: 'es' },
      locals: { user: EMAIL_USER },
    });
    const html = await res.text();
    expect(html).toContain('noindex');
  });

  it('uses the Inglés (light, bordered-blocks) visual theme', async () => {
    const res = await render('https://chuyocode.test/es/perfil', {
      params: { lang: 'es' },
      locals: { user: EMAIL_USER },
    });
    const html = await res.text();
    expect(html).toContain('data-theme="ingles"');
  });
});

describe('GET /[lang]/perfil — signed-in visitor (Google-only account)', () => {
  it('shows the Google-only note instead of the password form', async () => {
    const res = await render('https://chuyocode.test/es/perfil', {
      params: { lang: 'es' },
      locals: { user: GOOGLE_USER },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="profile-password-google-only"');
  });
});

describe('GET /[lang]/perfil — localization', () => {
  it('renders the English page title', async () => {
    const res = await render('https://chuyocode.test/en/perfil', {
      params: { lang: 'en' },
      locals: { user: EMAIL_USER },
    });
    const html = await res.text();
    expect(html).toContain('>Profile<');
  });
});
