import { describe, it, expect } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';
import CreditsPage from './creditos.astro';

// `locals.user` is `User | null` (strict Supabase type) — same loose-`Record`
// + spread-merge pattern as `_index.test.ts`'s own `render` helper, so a
// test can stand in a fake `{ id: 'user-1' }` signed-in visitor without
// satisfying every real `User` field.
async function render(
  url: string,
  { params, locals }: { params: Record<string, string>; locals?: Record<string, unknown> },
) {
  const container = await createContainer();
  return container.renderToResponse(CreditsPage, {
    locals: { user: null, ...locals },
    params,
    request: new Request(url),
  });
}

describe('GET /[lang]/creditos — content', () => {
  it('renders the page title and every credited resource, in Spanish', async () => {
    const res = await render('https://chuyocode.test/es/creditos', {
      params: { lang: 'es' },
      locals: { lang: 'es' },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Créditos');
    expect(html).toContain('Microsoft Fluent Emoji');
    expect(html).toContain('Phosphor Icons');
    expect(html).toContain('Raleway');
    expect(html).toContain('Open Peeps');
    expect(html).toContain('Open Doodles');
    expect(html).toContain('Google Flow');
  });

  it('renders English copy for lang=en', async () => {
    const res = await render('https://chuyocode.test/en/creditos', {
      params: { lang: 'en' },
      locals: { lang: 'en' },
    });
    const html = await res.text();
    expect(html).toContain('Credits');
    expect(html).toContain('generated with AI (Google Flow) for ChuyoCode');
  });
});

describe('GET /[lang]/creditos — license notices', () => {
  it('carries the Fluent Emoji MIT copyright notice and a link to its license', async () => {
    const res = await render('https://chuyocode.test/es/creditos', {
      params: { lang: 'es' },
      locals: { lang: 'es' },
    });
    const html = await res.text();
    expect(html).toContain('Copyright (c) Microsoft Corporation');
    expect(html).toContain('href="https://github.com/microsoft/fluentui-emoji/blob/main/LICENSE"');
  });

  it('carries the Phosphor Icons MIT copyright notice', async () => {
    const res = await render('https://chuyocode.test/es/creditos', {
      params: { lang: 'es' },
      locals: { lang: 'es' },
    });
    const html = await res.text();
    expect(html).toContain('Copyright (c) 2020 Phosphor Icons');
  });

  it('carries the Raleway SIL OFL copyright notice', async () => {
    const res = await render('https://chuyocode.test/es/creditos', {
      params: { lang: 'es' },
      locals: { lang: 'es' },
    });
    const html = await res.text();
    expect(html).toContain('Copyright 2010 The Raleway Project Authors');
  });

  it('carries the ChunkFive SIL OFL copyright notice in both languages', async () => {
    for (const lang of ['es', 'en'] as const) {
      const res = await render(`https://chuyocode.test/${lang}/creditos`, {
        params: { lang },
        locals: { lang },
      });
      const html = await res.text();
      expect(html).toContain('Copyright (c) 2009, Meredith Mandel');
      expect(html).toContain('ChunkFive');
    }
  });

  it('credits MET Norway for the weather widget, with a link to its terms of service', async () => {
    for (const lang of ['es', 'en'] as const) {
      const res = await render(`https://chuyocode.test/${lang}/creditos`, {
        params: { lang },
        locals: { lang },
      });
      const html = await res.text();
      expect(html).toContain('MET Norway');
      expect(html).toContain('CC BY 4.0');
      expect(html).toContain('href="https://api.met.no/doc/TermsOfService"');
    }
  });

  it('names Open Peeps / Open Doodles as CC0 and not yet in use', async () => {
    const res = await render('https://chuyocode.test/es/creditos', {
      params: { lang: 'es' },
      locals: { lang: 'es' },
    });
    const html = await res.text();
    expect(html).toContain('CC0');
    expect(html).toContain('Todavía no se usan en el sitio');
  });
});

describe('GET /[lang]/creditos — indexable + publicly cacheable', () => {
  it('does not carry a noindex robots meta tag', async () => {
    const res = await render('https://chuyocode.test/es/creditos', {
      params: { lang: 'es' },
      locals: { lang: 'es' },
    });
    const html = await res.text();
    expect(html).not.toContain('noindex');
  });

  it('applies the same public edge-cache policy as the home page', async () => {
    const res = await render('https://chuyocode.test/es/creditos', {
      params: { lang: 'es' },
      locals: { lang: 'es' },
    });
    expect(res.headers.get('CDN-Cache-Control')).toBe(
      'public, s-maxage=3600, stale-while-revalidate=86400',
    );
  });

  it('renders byte-identical HTML for an anonymous and a signed-in visitor', async () => {
    const resAnon = await render('https://chuyocode.test/es/creditos', {
      params: { lang: 'es' },
      locals: { lang: 'es', user: null },
    });
    const resUser = await render('https://chuyocode.test/es/creditos', {
      params: { lang: 'es' },
      locals: { lang: 'es', user: { id: 'user-1' } },
    });

    const htmlAnon = await resAnon.text();
    const htmlUser = await resUser.text();
    expect(htmlUser).toBe(htmlAnon);
  });
});
