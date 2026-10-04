import { describe, it, expect } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';
import PremiumPage from './premium.astro';
import { UI_LABELS } from '@lib/i18n';

/** Render the premium page with route params + middleware locals. */
async function render(
  url: string,
  { params, locals }: { params: Record<string, string>; locals?: Record<string, unknown> },
) {
  const container = await createContainer();
  return container.renderToResponse(PremiumPage, {
    // `App.Locals.user` is required, never optional — default to an
    // anonymous visitor; a caller may override it, same convention as
    // `[lang]/_index.test.ts`.
    locals: { user: null, ...locals },
    params,
    request: new Request(url),
  });
}

describe('GET /[lang]/premium — headline, prices, founder note', () => {
  const cases = [
    {
      lang: 'es',
      headline: 'Premium desde US$1 al mes',
      freePrice: 'US$0',
      annualPrice: 'US$12/año',
      monthlyPrice: 'US$2,99/mes',
      founderNote: 'US$9,99 al año, de por vida, para los primeros 200 suscriptores',
      comingSoon: 'Próximamente',
    },
    {
      lang: 'en',
      headline: 'Premium from US$1 a month',
      freePrice: 'US$0',
      annualPrice: 'US$12/year',
      monthlyPrice: 'US$2.99/month',
      founderNote: 'US$9.99 a year, for life, for the first 200 subscribers',
      comingSoon: 'Coming soon',
    },
  ] as const;

  for (const c of cases) {
    it(`renders the headline, the three prices and the founder note (${c.lang})`, async () => {
      const res = await render(`https://chuyocode.test/${c.lang}/premium`, {
        params: { lang: c.lang },
        locals: { lang: c.lang },
      });
      const html = await res.text();

      expect(html).toContain(c.headline);
      expect(html).toContain(c.freePrice);
      expect(html).toContain(c.annualPrice);
      expect(html).toContain(c.monthlyPrice);
      expect(html).toContain(c.founderNote);
      // Two paid plans, both "coming soon" — the free plan is the only
      // working CTA, asserted separately below.
      expect(html.split(c.comingSoon).length - 1).toBeGreaterThanOrEqual(2);
    });
  }
});

describe('GET /[lang]/premium — CTAs', () => {
  it('links the Free plan to the activities feed as a real <a href>', async () => {
    const res = await render('https://chuyocode.test/es/premium', {
      params: { lang: 'es' },
      locals: { lang: 'es' },
    });
    const html = await res.text();

    expect(html).toContain('data-testid="premium-cta-free"');
    expect(html).toMatch(/<a[^>]+href="\/es\/ingles\/actividades"[^>]*data-testid="premium-cta-free"/);
  });

  it('renders the Annual/Monthly "Próximamente" CTAs as inert, non-link text', async () => {
    const res = await render('https://chuyocode.test/es/premium', {
      params: { lang: 'es' },
      locals: { lang: 'es' },
    });
    const html = await res.text();

    // Both disabled CTAs are plain <span aria-disabled="true">, never <a>.
    expect(html).toMatch(/<span[^>]+aria-disabled="true"[^>]*data-testid="premium-cta-annual"/);
    expect(html).toMatch(/<span[^>]+aria-disabled="true"[^>]*data-testid="premium-cta-monthly"/);
    // Neither disabled CTA is wrapped in or renders as an anchor.
    expect(html).not.toMatch(/<a[^>]*data-testid="premium-cta-annual"/);
    expect(html).not.toMatch(/<a[^>]*data-testid="premium-cta-monthly"/);
  });
});

describe('GET /[lang]/premium — comparison table', () => {
  it('renders Free vs Premium rows built from the owner feature lists (es)', async () => {
    const res = await render('https://chuyocode.test/es/premium', {
      params: { lang: 'es' },
      locals: { lang: 'es' },
    });
    const html = await res.text();

    expect(html).toContain('data-testid="premium-comparison-table"');
    // A feature already free today.
    expect(html).toContain('Crear actividades');
    // A feature that is Premium-only and honestly marked as not live yet.
    expect(html).toContain('Progreso sincronizado y repaso de errores');
    expect(html).toContain('Nivel MCER estimado con certificado verificable');
    // Every row comes from the shared i18n map — spot check row count.
    const rows = UI_LABELS.es.premium.comparison.rows;
    for (const row of rows) {
      expect(html).toContain(row.feature);
    }
  });

  it('renders Free vs Premium rows in en', async () => {
    const res = await render('https://chuyocode.test/en/premium', {
      params: { lang: 'en' },
      locals: { lang: 'en' },
    });
    const html = await res.text();

    expect(html).toContain('Create activities');
    expect(html).toContain('Synced progress and mistake review');
    expect(html).toContain('CEFR level estimate with a verifiable certificate');
  });
});

describe('GET /[lang]/premium — FAQ', () => {
  it('answers the refund question honestly (no refund page exists yet)', async () => {
    const res = await render('https://chuyocode.test/es/premium', {
      params: { lang: 'es' },
      locals: { lang: 'es' },
    });
    const html = await res.text();

    expect(html).toContain('¿Hay reembolso?');
    expect(html).toContain('Te lo contaremos en nuestra política de reembolsos al activar los pagos.');
    // Never a link to a refund page that does not exist.
    expect(html).not.toContain('/es/legal/reembolsos');
  });

  it('tells the visitor their free activities stay free if they never pay', async () => {
    const res = await render('https://chuyocode.test/es/premium', {
      params: { lang: 'es' },
      locals: { lang: 'es' },
    });
    const html = await res.text();

    expect(html).toContain('¿Qué pasa con mis actividades si no pago?');
    expect(html).toContain('Siguen siendo tuyas y gratis');
  });
});

describe('GET /[lang]/premium — public cache safety', () => {
  // Same invariant as the home page (`[lang]/_index.test.ts`): this page
  // applies `publicCachePolicy()` on the assumption its markup is
  // byte-identical for every visitor. It never reads `Astro.locals.user`.
  it('renders byte-identical HTML for an anonymous and a signed-in visitor', async () => {
    const resAnon = await render('https://chuyocode.test/es/premium', {
      params: { lang: 'es' },
      locals: { lang: 'es', user: null },
    });
    const resUser = await render('https://chuyocode.test/es/premium', {
      params: { lang: 'es' },
      locals: { lang: 'es', user: { id: 'user-1' } },
    });

    const htmlAnon = await resAnon.text();
    const htmlUser = await resUser.text();
    expect(htmlUser).toBe(htmlAnon);
  });

  it('keeps the public edge-cache header', async () => {
    const res = await render('https://chuyocode.test/es/premium', {
      params: { lang: 'es' },
      locals: { lang: 'es' },
    });
    expect(res.headers.get('CDN-Cache-Control')).toBe(
      'public, s-maxage=3600, stale-while-revalidate=86400',
    );
  });
});

describe('GET /[lang]/premium — invalid lang', () => {
  it('404s for an unsupported language with no valid locals.lang', async () => {
    const res = await render('https://chuyocode.test/fr/premium', {
      params: { lang: 'fr' },
      locals: { lang: undefined },
    });
    expect(res.status).toBe(404);
  });
});
