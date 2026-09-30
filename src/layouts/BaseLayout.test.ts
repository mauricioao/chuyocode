import { describe, it, expect } from 'vitest';
import BaseLayout from './BaseLayout.astro';
import { createContainer } from '@/testSupport/astroContainer';

// `fullHeight` (floating side toolbar pass, owner request: the editor page
// must not scroll at the page level) is OPT-IN — every other page keeps
// rendering exactly the same `body`/`main` classes it always has.
describe('BaseLayout — full-height mode is opt-in', () => {
  it('defaults to normal document flow: no lg:h-dvh, no lg:overflow-hidden on body/main', async () => {
    const container = await createContainer();
    const html = await container.renderToString(BaseLayout, {
      props: { lang: 'es' },
      slots: { default: '<div>content</div>' },
    });
    expect(html).toContain('min-h-screen');
    expect(html).not.toContain('h-dvh');
    expect(html).not.toContain('lg:overflow-hidden');
  });

  it('opting in adds lg:-only non-scrolling body/main classes, on top of (not instead of) the normal-flow ones', async () => {
    const container = await createContainer();
    const html = await container.renderToString(BaseLayout, {
      props: { lang: 'es', fullHeight: true },
      slots: { default: '<div>content</div>' },
    });
    // Narrow screens still get the normal-flow classes (owner request: below
    // lg, every page — including this one — keeps ordinary scrolling).
    expect(html).toContain('min-h-screen');
    // lg+ gets the bounded, non-scrolling pair.
    expect(html).toContain('lg:h-dvh');
    expect(html).toContain('lg:overflow-hidden');
    expect(html).toContain('lg:min-h-0');
  });
});

// Navigation-without-flicker PR: only the main content cross-fades on
// navigation; header/footer/progress bar are excluded (persisted or
// animate="none") so there is never a double-content cross-fade.
describe('BaseLayout — navigation transitions (navigation-without-flicker PR)', () => {
  it('mounts the navigation progress bar', async () => {
    const container = await createContainer();
    const html = await container.renderToString(BaseLayout, {
      props: { lang: 'es' },
      slots: { default: '<div>content</div>' },
    });
    expect(html).toContain('id="nav-progress-bar"');
  });

  it('gives <main> its own transition scope (a fade), distinct from the rest of the page', async () => {
    const container = await createContainer();
    const html = await container.renderToString(BaseLayout, {
      props: { lang: 'es' },
      slots: { default: '<div>content</div>' },
    });
    const mainOpenTag = html.slice(html.indexOf('<main'), html.indexOf('>', html.indexOf('<main')) + 1);
    expect(mainOpenTag).toContain('data-astro-transition-scope');
  });

  it('excludes the footer from the page fade animation', async () => {
    const container = await createContainer();
    const html = await container.renderToString(BaseLayout, {
      props: { lang: 'es' },
      slots: { default: '<div>content</div>' },
    });
    const footerOpenTag = html.slice(html.indexOf('<footer'), html.indexOf('>', html.indexOf('<footer')) + 1);
    expect(footerOpenTag).toContain('data-astro-transition-scope');
  });

  it('persists the header across navigations', async () => {
    const container = await createContainer();
    const html = await container.renderToString(BaseLayout, {
      props: { lang: 'es' },
      slots: { default: '<div>content</div>' },
    });
    expect(html).toContain('data-astro-transition-persist');
  });
});
