/**
 * GET /404 (prelaunch SEO audit).
 *
 * Astro's own router already forces a real HTTP 404 status for a genuinely
 * unmatched route (`astro/dist/core/errors/default-handler.js` merges the
 * rendered page's response onto the no-route-matched marker response, whose
 * status wins whenever it isn't 200) — but that only covers requests that
 * actually go through the router's no-match path. A direct render of this
 * page (and Astro's documented best practice for a custom SSR 404 page) also
 * needs the page to set its own status explicitly, and to stay out of search
 * results regardless of which URL it was reached from.
 */
import { describe, it, expect } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';
import NotFoundPage from './404.astro';

describe('GET /404', () => {
  it('answers with a real 404 status', async () => {
    const container = await createContainer();
    const res = await container.renderToResponse(NotFoundPage, {
      request: new Request('https://chuyocode.test/es/this-does-not-exist'),
    });
    expect(res.status).toBe(404);
  });

  it('is marked noindex regardless of the requested path', async () => {
    const container = await createContainer();
    const res = await container.renderToResponse(NotFoundPage, {
      request: new Request('https://chuyocode.test/es/this-does-not-exist'),
    });
    const html = await res.text();
    expect(html).toContain('<meta name="robots" content="noindex"');
  });

  it('is on-brand and useful: a title/body and a link back home', async () => {
    const container = await createContainer();
    const res = await container.renderToResponse(NotFoundPage, {
      request: new Request('https://chuyocode.test/es/this-does-not-exist'),
    });
    const html = await res.text();
    expect(html).toContain('404');
    expect(html).toMatch(/href="\/es\/"/);
  });
});
