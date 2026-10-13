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
        foldedLabel: 'Un tip de Vanina',
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

  // Mobile-layout polish round: the open card reads as the kit's own
  // surface (white, L1 shadow, radius 20), never the desktop-only
  // speech-bubble look (thick black border, 18px radius) — that gets
  // `desk:`-restored byte for byte instead.
  it('gives the open tip card the kit surface treatment on mobile (white, shadow-elevation-1, radius 20), restoring the original bubble look on desktop', async () => {
    const html = await render();
    const bubbleMatch = html.match(/<div[^>]*id="desk-helper-bubble"[^>]*class="([^"]*)"/);
    const tokens = bubbleMatch![1].split(/\s+/);

    expect(tokens).toContain('rounded-[20px]');
    expect(tokens).toContain('border');
    expect(tokens).toContain('border-border');
    expect(tokens).toContain('shadow-elevation-1');
    expect(tokens).not.toContain('border-2');
    expect(tokens).not.toContain('border-foreground');
    expect(tokens).not.toContain('rounded-[18px]');

    expect(tokens).toContain('desk:rounded-[18px]');
    expect(tokens).toContain('desk:border-2');
    expect(tokens).toContain('desk:border-foreground');
    expect(tokens).toContain('desk:shadow-none');
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

  // Mobile-layout polish round (owner report: "a lonely ~56px circle with
  // nothing next to it reads as a stray image"): folding must never leave a
  // bare avatar below `desk:` — this element takes the open card's place.
  it('renders a fold-label element (never a bare circle when folded), hidden at desktop', async () => {
    const html = await render();
    expect(html).toContain('Un tip de Vanina');

    const labelMatch = html.match(/<button[^>]*id="desk-helper-fold-label"[^>]*class="([^"]*)"/);
    expect(labelMatch).not.toBeNull();
    const tokens = labelMatch![1].split(/\s+/);
    expect(tokens).toContain('desk:hidden'); // desktop's fold stays the original bare avatar
  });

  it('starts server-rendered as the "open" default (fold label hidden, bubble not hidden) — the anti-flash script decides the real fold state before paint', async () => {
    const html = await render();
    const labelMatch = html.match(/<button[^>]*id="desk-helper-fold-label"[^>]*class="([^"]*)"/);
    const tokens = labelMatch![1].split(/\s+/);
    expect(tokens).toContain('hidden');
    expect(html).not.toMatch(/<div[^>]*id="desk-helper-bubble"[^>]* hidden/);
  });

  // The anti-flash `is:inline` script's own THREE-range decision — mobile
  // default OPEN, 1100-1440px default FOLDED, 1440px+ default OPEN again.
  it('decides fold state from three width ranges before paint, not just one cutoff', async () => {
    const html = await render();
    const scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    expect(scriptMatch).not.toBeNull();
    const script = scriptMatch![1];
    expect(script).toContain("matchMedia('(min-width: 1100px)')");
    expect(script).toContain("matchMedia('(min-width: 1440px)')");
    expect(script).toContain('isDesktopRange && !isWideEnough');
  });
});
