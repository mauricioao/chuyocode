import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import DeskHelper from './DeskHelper.astro';

// Owner report ("version móvil del inglés pantalla rota" follow-up): a
// FIXED helper always covers SOMETHING on a phone (in the owner's own
// screenshot, the A1 level tile). Below the `desk:` breakpoint the helper
// now renders IN FLOW — a normal row, never `position: fixed` — instead of
// floating over whatever happens to scroll underneath it; `desk:` and up
// keeps the original fixed bottom-left composition unchanged.
describe('DeskHelper.astro — mobile in-flow vs. desktop fixed (visual bugs pass)', () => {
  async function render() {
    const container = await AstroContainer.create();
    return container.renderToString(DeskHelper, {
      props: {
        lang: 'es',
        landmarkLabel: 'Ayuda',
        avatarLabelTemplate: 'Ayuda de {name}',
        otherTipLabel: 'Otro tip',
        closeLabel: 'Cerrar ayuda',
      },
    });
  }

  it('is never `position: fixed` below `desk:` — only `desk:fixed`, no bare `fixed` class', async () => {
    const html = await render();
    const asideMatch = html.match(/<aside[^>]*id="desk-helper"[^>]*class="([^"]*)"/);
    expect(asideMatch).not.toBeNull();
    const tokens = asideMatch![1].split(/\s+/);
    expect(tokens).not.toContain('fixed');
    expect(tokens).toContain('desk:fixed');
  });

  it('gives the helper row a mobile `order-4` (right after the levels dock), restored to plain order on desktop', async () => {
    const html = await render();
    const asideMatch = html.match(/<aside[^>]*id="desk-helper"[^>]*class="([^"]*)"/);
    const tokens = asideMatch![1].split(/\s+/);
    expect(tokens).toContain('order-4');
    expect(tokens).toContain('desk:order-none');
  });

  it('spans the full row width with the page gutter on mobile, auto width on desktop', async () => {
    const html = await render();
    const asideMatch = html.match(/<aside[^>]*id="desk-helper"[^>]*class="([^"]*)"/);
    const tokens = asideMatch![1].split(/\s+/);
    expect(tokens).toContain('w-full');
    expect(tokens).toContain('px-4');
    expect(tokens).toContain('desk:w-auto');
    expect(tokens).toContain('desk:px-0');
  });

  it('restores the exact original fixed bottom-left desktop position', async () => {
    const html = await render();
    const asideMatch = html.match(/<aside[^>]*id="desk-helper"[^>]*class="([^"]*)"/);
    const tokens = asideMatch![1].split(/\s+/);
    expect(tokens).toContain('desk:bottom-[calc(10px+var(--desk-helper-lift,0px)+var(--desk-helper-dock-lift,0px))]');
    expect(tokens).toContain('desk:left-5');
    expect(tokens).toContain('desk:z-[5]');
  });

  it('shrinks the avatar to ~56px on mobile (48–56px range), keeping the original 96px desktop size', async () => {
    const html = await render();
    const avatarMatch = html.match(/<button[^>]*id="desk-helper-avatar"[^>]*class="([^"]*)"/);
    expect(avatarMatch).not.toBeNull();
    const tokens = avatarMatch![1].split(/\s+/);
    expect(tokens).toContain('h-14'); // 56px
    expect(tokens).toContain('w-14');
    expect(tokens).toContain('desk:h-24'); // unchanged, 96px
    expect(tokens).toContain('desk:w-24');
  });

  it('lets the tip bubble fill the row (inline, not a floating speech bubble) on mobile, restores the original floating composition on desktop', async () => {
    const html = await render();
    const bubbleMatch = html.match(/<div[^>]*id="desk-helper-bubble"[^>]*class="([^"]*)"/);
    expect(bubbleMatch).not.toBeNull();
    const tokens = bubbleMatch![1].split(/\s+/);
    expect(tokens).toContain('flex-1');
    expect(tokens).toContain('min-w-0');
    expect(tokens).not.toContain('max-w-[250px]'); // the old fixed-composition cap, gone from the mobile base
    expect(tokens).toContain('desk:flex-none');
    expect(tokens).toContain('desk:max-w-[290px]');
    expect(tokens).toContain('desk:-ml-3.5');
    expect(tokens).toContain('desk:mb-[76px]');
  });

  it('hides the speech-bubble tail on mobile (it only makes sense pointing at a fixed avatar) and shows it on desktop', async () => {
    const html = await render();
    const tailMatch = html.match(/<svg class="([^"]*)" viewBox="0 0 26 21"/);
    expect(tailMatch).not.toBeNull();
    const tokens = tailMatch![1].split(/\s+/);
    expect(tokens).toContain('hidden');
    expect(tokens).toContain('desk:block');
  });

  it('still renders the tip text, avatar name and "Otro tip" link the same as before', async () => {
    const html = await render();
    expect(html).toContain('Vanina');
    expect(html).toContain('Otro tip');
    expect(html).toContain('id="desk-helper-next"');
    expect(html).toContain('id="desk-helper-close"');
  });
});
