import { describe, it, expect } from 'vitest';
import NavProgressBar from './NavProgressBar.astro';
import { createContainer } from '@/testSupport/astroContainer';

// The real behavior (start/trickle/complete/abort, reduced motion) is
// covered by `src/lib/navProgress.test.ts`, dispatching the real Astro
// events directly (jsdom can't run real view transitions). These tests
// only pin the static markup contract that behavior depends on.
describe('NavProgressBar.astro', () => {
  it('renders a single fixed bar at the very top, hidden by default', async () => {
    const container = await createContainer();
    const html = await container.renderToString(NavProgressBar, {});

    expect(html).toContain('id="nav-progress-bar"');
    expect(html).toContain('fixed');
    expect(html).toContain('inset-x-0');
    expect(html).toContain('top-0');
    expect(html).toContain('opacity-0');
    expect(html).toContain('style="width:0%"');
  });

  it('is aria-hidden and never intercepts pointer events', async () => {
    const container = await createContainer();
    const html = await container.renderToString(NavProgressBar, {});

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('pointer-events-none');
  });

  it('persists across navigations and opts out of the page fade animation', async () => {
    const container = await createContainer();
    const html = await container.renderToString(NavProgressBar, {});

    expect(html).toContain('data-astro-transition-persist');
    const barOpenTag = html.slice(html.indexOf('<div'), html.indexOf('>', html.indexOf('<div')) + 1);
    expect(barOpenTag).toContain('data-astro-transition-scope');
  });

  it('respects reduced motion (no opacity transition)', async () => {
    const container = await createContainer();
    const html = await container.renderToString(NavProgressBar, {});

    expect(html).toContain('motion-reduce:transition-none');
  });
});
