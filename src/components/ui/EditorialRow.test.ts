import { describe, it, expect, vi } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';

// EditorialRow renders MediaCards, whose covers go through buildImage(), which
// lazily builds a `@sanity/image-url` client from validated env vars. vi.mock is
// hoisted, so stub `@lib/env` before the component graph loads.
vi.mock('@lib/env', () => ({
  loadEnv: () => ({
    SANITY_PROJECT_ID: 'proj',
    SANITY_DATASET: 'production',
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: '',
    AD_HMAC_SECRET: '',
  }),
}));

import EditorialRow from './EditorialRow.astro';
import { CHEVRON_PATH } from '@lib/arrowControl';

// A normalized MediaItem as produced by getRowsByTheme() → toMediaItem().
const item = (n: number) => ({
  _id: `doc-${n}`,
  kind: n % 2 === 0 ? ('news' as const) : ('book' as const),
  title: `Item ${n}`,
  slug: `item-${n}`,
  href: n % 2 === 0 ? `/es/noticias/item-${n}` : `/es/libros/item-${n}`,
  asset: {
    url: `https://cdn.sanity.io/images/proj/production/cover${n}-800x1200.jpg`,
    metadata: { lqip: 'data:image/jpeg;base64,QUJD' },
  },
  tagline: `Tagline ${n}`,
  featured: false,
});

async function render(props: Record<string, unknown>): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(EditorialRow, { props });
}

describe('EditorialRow.astro', () => {
  it('renders the section title', async () => {
    const html = await render({ title: 'Architecture', items: [item(1), item(2)] });
    expect(html).toContain('Architecture');
    expect(html).toContain('data-editorial-row');
  });

  it('renders prev/next arrow buttons wired for scrollBy', async () => {
    const html = await render({ title: 'Row', items: [item(1), item(2)] });
    expect(html).toContain('data-editorial-prev');
    expect(html).toContain('data-editorial-next');
    // The arrow script binds scrollBy on the track.
    expect(html).toContain('<script');
    expect(html).toContain('scrollBy');
    expect(html).toContain('data-astro-rerun');
  });

  /**
   * THE PAGE-SCROLL-ON-CLICK GUARD — and be clear about what it is worth.
   *
   * jsdom has no layout engine and never scrolls, so the BUG itself cannot be
   * reproduced or refuted here; only a browser can confirm the fix. What this
   * pins is the SHAPE of the mitigation, which is the part that silently
   * regresses: that focus is taken deliberately with `preventScroll` on
   * `pointerdown` (one listener covering mouse, touch AND pen) rather than
   * suppressed via `mousedown` + preventDefault, which covered mouse only and
   * dropped focus to <body> on the path where it worked.
   */
  it('takes focus without scrolling, on pointerdown rather than mousedown', async () => {
    const html = await render({ title: 'Row', items: [item(1), item(2)] });

    expect(html).toContain('pointerdown');
    expect(html).toContain('preventScroll');
    // The old approach must be gone: re-adding it is the regression.
    expect(html).not.toContain("addEventListener('mousedown'");
  });

  it('draws both chevrons from the shared arrow-control geometry', async () => {
    const html = await render({ title: 'Row', items: [item(1), item(2)] });

    // Same path data the exercise stepper's React arrows render, so the two
    // controls cannot drift apart.
    expect(html).toContain(CHEVRON_PATH.prev);
    expect(html).toContain(CHEVRON_PATH.next);
    // The glyph carries no name — the button's aria-label is the whole label.
    expect(html).toContain('aria-label="Scroll left"');
    expect(html).toContain('aria-label="Scroll right"');
  });

  it('renders an always-visible accent-colored right (next) arrow', async () => {
    const html = await render({ title: 'Row', items: [item(1), item(2)] });
    const nextIdx = html.indexOf('data-editorial-next');
    expect(nextIdx).toBeGreaterThan(-1);
    // Isolate the next-arrow button markup (from its opening tag to the id).
    const btnStart = html.lastIndexOf('<button', nextIdx);
    const nextButton = html.slice(btnStart, nextIdx + 40);
    // It is accent-colored ("there's more" affordance)…
    expect(nextButton).toContain('text-accent');
    // …and NOT hover-gated (no opacity-gate class on the next arrow itself).
    expect(nextButton).not.toContain('editorial-arrow ');
  });

  it('renders a right-edge fade element that cuts off the last card', async () => {
    const html = await render({ title: 'Row', items: [item(1), item(2)] });
    // A dedicated fade element (not a symmetric track mask) fades the right edge
    // to black. It is non-interactive so it never eats card clicks.
    expect(html).toContain('editorial-fade');
    expect(html).toContain('from-black');
  });

  it('renders a scroll-snap track of the items', async () => {
    const html = await render({ title: 'Row', items: [item(1), item(2), item(3)] });
    expect(html).toContain('data-editorial-track');
    expect(html).toContain('snap-x');
    expect(html).toContain('snap-mandatory');
  });

  it('starts the track from a left gutter aligned with the title', async () => {
    const html = await render({ title: 'Row', items: [item(1), item(2)] });
    // Cards are indented from the viewport edge (shademanga gutter), matching
    // the title's px-4 sm:px-6 leading padding — the symmetric mask is gone.
    expect(html).toContain('data-editorial-track');
    expect(html).toContain('pl-4');
    expect(html).toContain('sm:pl-6');
  });

  it('renders a MediaCard per item, mixing books and news', async () => {
    const html = await render({ title: 'Row', items: [item(1), item(2), item(3)] });
    expect(html).toContain('Item 1');
    expect(html).toContain('Item 2');
    expect(html).toContain('Item 3');
    // Poster variant cards with deep-links for both content kinds.
    expect(html).toContain('data-variant="poster"');
    expect(html).toContain('href="/es/libros/item-1"');
    expect(html).toContain('href="/es/noticias/item-2"');
  });

  it('passes each item kind through to the MediaCard type tag', async () => {
    // item(1) is a book, item(2) is news → tags "Libro" and "Noticia".
    const html = await render({ title: 'Row', items: [item(1), item(2)] });
    expect(html).toContain('Libro');
    expect(html).toContain('Noticia');
  });

  it('uses a responsive card width (~130px mobile → ~270px desktop)', async () => {
    const html = await render({ title: 'Row', items: [item(1)] });
    expect(html).toContain('w-[130px]');
    expect(html).toContain('sm:w-[200px]');
    expect(html).toContain('lg:w-[270px]');
  });

  it('renders nothing when there are no items', async () => {
    const html = await render({ title: 'Empty', items: [] });
    expect(html).not.toContain('data-editorial-row');
    expect(html).not.toContain('data-editorial-track');
    expect(html).not.toContain('<script');
  });

  /**
   * THE DUPLICATE-VIEW-TRANSITION-NAME REGRESSION GUARD.
   *
   * `view-transition-name` must be UNIQUE per page. It is not a style hint —
   * the spec makes a duplicate a hard error: the browser logs "Unexpected
   * duplicate view-transition-name: cover-<id>" and ABORTS the transition with
   * an `InvalidStateError`, taking down the default root cross-fade that
   * `<ClientRouter />` gives every navigation.
   *
   * A document legitimately appears more than once on the home page: `themes`
   * is a multi-select array, so one book sits in several EditorialRows AND in
   * the RankedRow. A name keyed on the document id therefore CANNOT be unique
   * per page. That is why `MediaCard` no longer emits one at all, instead of
   * gating it behind an opt-in prop — an opt-in flag is a convention someone
   * regresses, and this single row would still duplicate a document that
   * belongs to two themes.
   *
   * WHY THIS ASSERTS ABSENCE RATHER THAN UNIQUENESS (measured, not assumed):
   * Astro compiles `transition:name` into `data-astro-transition-scope` plus a
   * scoped rule carrying the real name. The scope token is a PER-INSTANCE
   * COUNTER (`astro-<hash>-1`, `astro-<hash>-2`), so the tokens are always
   * distinct even when the names they map to are identical — asserting token
   * uniqueness would pass vacuously. The Container API also emits no `<style>`,
   * so the names themselves never reach this markup. Absence of the scope
   * attribute is the sound proxy: no scope → no rule → no name → no duplicate,
   * by construction.
   */
  it('emits no view-transition scope on covers when one document repeats', async () => {
    const repeated = item(1);
    const html = await render({ title: 'Row', items: [repeated, repeated] });

    // Precondition: the row really did render the SAME document twice — this is
    // the shape that produced the browser error.
    expect(html.split('href="/es/libros/item-1"').length - 1).toBe(2);

    const imgs = html.match(/<img[^>]*>/g) ?? [];
    expect(imgs.length).toBe(2);
    for (const img of imgs) {
      expect(img).not.toContain('data-astro-transition-scope');
    }
  });
});
