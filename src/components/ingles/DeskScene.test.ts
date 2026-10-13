import { describe, it, expect } from 'vitest';
import DeskScene from './DeskScene.astro';
import { UI_LABELS } from '@lib/i18n';
import { createContainer } from '@/testSupport/astroContainer';

// Owner report ("version móvil del inglés pantalla rota, mala distribución"):
// below the `desk:` breakpoint (1100px) the widgets (clock/calendar/player/
// weather) used to render in a spot that visually collided with the greeting
// and the levels dock, and in the wrong order relative to the owner's own
// mobile-layout spec: header -> greeting -> folders -> "Ir directo a tu
// nivel" -> widgets -> footer. These tests pin the FLOW layout (`order-*`
// Tailwind utilities on flex siblings, never `position: absolute` outside an
// explicit `desk:` prefix) and the resulting DOM/visual order.
describe('DeskScene.astro — mobile layout (visual bugs pass)', () => {
  const hub = UI_LABELS.es.english.hub;

  async function render() {
    const container = await createContainer();
    return container.renderToString(DeskScene, {
      props: {
        lang: 'es',
        isHub: true,
        greetingLine1: '¡Hola, Juan!',
        activityCountLabel: '12 ejercicios',
        dailyPickHref: '/es/ingles/actividades/abc',
        dailyPickMeta: 'Vocabulary 1',
        dailyPickPeek: null,
        myActivitiesMeta: '3 actividades',
        myActivitiesBadgeCount: 0,
        myActivitiesBadgeLabel: null,
        weatherLat: -12.05,
        weatherLon: -77.04,
        weatherCity: 'Lima',
        weatherLabel: 'Clima en Lima',
        playerLabels: {
          title: hub.playerTitle,
          prev: hub.playerPrev,
          next: hub.playerNext,
          play: hub.playerPlay,
          pause: hub.playerPause,
          unavailable: hub.playerUnavailable,
        },
        labels: {
          greetingQuestion: hub.greetingQuestion,
          greetingSubtitle: hub.greetingSubtitle,
          foldersLabel: hub.foldersLabel,
          communityTitle: hub.communityTitle,
          todayTitle: hub.todayTitle,
          myActivitiesTitle: hub.myActivitiesTitle,
          createActivityLabel: UI_LABELS.es.activities.start.pageTitle,
          widgetsLabel: hub.widgetsLabel,
          weatherUnavailable: hub.weatherUnavailable,
          weatherAttribution: hub.weatherAttribution,
          levelShortcutTitle: hub.levelShortcutTitle,
        },
      },
    });
  }

  it('keeps the greeting, folders, widgets and levels-dock sections in normal flow below `desk:` — a bare `absolute`/`fixed` class (not `desk:`-prefixed) on any of them is the reported overlap bug', async () => {
    const html = await render();

    // Each major section's OWN class list, targeted by a distinctive marker
    // rather than a blind scan of every element — a small always-absolute
    // decoration (e.g. the clock widget's own hover tooltip) is legitimate
    // and unrelated to this bug, so only the five flow sections themselves
    // are checked.
    const chromeRowMatch = html.match(/<div[^>]*data-desk-chrome-row[^>]*class="([^"]*)"/);
    const greetingMatch = html.match(/<div class="([^"]*desk:pointer-events-none[^"]*)"/);
    const foldersMatch = html.match(/<nav[^>]*data-desk-folders[^>]*class="([^"]*)"/);
    const widgetsMatch = html.match(new RegExp(`<section aria-label="${hub.widgetsLabel}" class="([^"]*)"`));
    const dockMatch = html.match(/<div class="([^"]*desk:bottom-10[^"]*)"/);

    for (const match of [chromeRowMatch, greetingMatch, foldersMatch, widgetsMatch, dockMatch]) {
      expect(match).not.toBeNull();
      const tokens = (match![1] ?? '').split(/\s+/);
      expect(tokens).not.toContain('absolute');
      expect(tokens).not.toContain('fixed');
    }
  });

  // The DOM/source order never changes here (`DeskScene.astro`'s own
  // sibling order is fixed) — what actually decides the on-screen mobile
  // sequence is each sibling's own flex `order-N` Tailwind class, restored to
  // plain DOM order on desktop via `desk:order-none`. So the real assertion
  // is on the `order-N` VALUES themselves, ascending in the owner's own
  // mobile-layout order: greeting(1) -> folders(2) -> levels dock(3) ->
  // helper slot(4) -> widgets(5) -> footer (outside this component, in
  // `BaseLayout.astro`). The helper slot itself is empty in these tests (no
  // `slot="helper"` child passed) — its own `order-4` lives on whatever gets
  // slotted in, not on the `<slot>` tag — see `DeskHelper.test.ts` for that
  // component's own order assertion, and the "helper slot" test below for
  // proof of WHERE a slotted child actually lands.
  it('gives the greeting, folders, dock and widgets sections ascending mobile `order-*` values matching the owner spec, all restored on desktop via `desk:order-none`', async () => {
    const html = await render();

    const greetingMatch = html.match(/<div class="([^"]*desk:pointer-events-none[^"]*)"/);
    const foldersMatch = html.match(/<nav[^>]*data-desk-folders[^>]*class="([^"]*)"/);
    const dockMatch = html.match(/<div class="([^"]*desk:bottom-10[^"]*)"/);
    const widgetsMatch = html.match(new RegExp(`<section aria-label="${hub.widgetsLabel}" class="([^"]*)"`));

    expect(greetingMatch?.[1]).toContain('order-1');
    expect(foldersMatch?.[1]).toContain('order-2');
    expect(dockMatch?.[1]).toContain('order-3');
    expect(widgetsMatch?.[1]).toContain('order-5');

    for (const match of [greetingMatch, foldersMatch, dockMatch, widgetsMatch]) {
      expect(match?.[1]).toContain('desk:order-none');
    }
  });

  // Owner mobile-layout follow-up ("a row after the levels bar"):
  // `DeskHost.astro` passes `<DeskHelper slot="helper">` as a CHILD of
  // `DeskScene`, and this component's own `<slot name="helper">` places it
  // right after the dock, before the widgets section — proven here with a
  // plain marker element standing in for the real `DeskHelper`.
  it('renders a slotted "helper" child right after the levels dock and before the widgets section', async () => {
    const container = await createContainer();
    const htmlWithSlot = await container.renderToString(DeskScene, {
      props: {
        lang: 'es',
        isHub: true,
        greetingLine1: '¡Hola, Juan!',
        activityCountLabel: '12 ejercicios',
        dailyPickHref: '/es/ingles/actividades/abc',
        dailyPickMeta: 'Vocabulary 1',
        dailyPickPeek: null,
        myActivitiesMeta: '3 actividades',
        myActivitiesBadgeCount: 0,
        myActivitiesBadgeLabel: null,
        weatherLat: -12.05,
        weatherLon: -77.04,
        weatherCity: 'Lima',
        weatherLabel: 'Clima en Lima',
        playerLabels: {
          title: hub.playerTitle,
          prev: hub.playerPrev,
          next: hub.playerNext,
          play: hub.playerPlay,
          pause: hub.playerPause,
          unavailable: hub.playerUnavailable,
        },
        labels: {
          greetingQuestion: hub.greetingQuestion,
          greetingSubtitle: hub.greetingSubtitle,
          foldersLabel: hub.foldersLabel,
          communityTitle: hub.communityTitle,
          todayTitle: hub.todayTitle,
          myActivitiesTitle: hub.myActivitiesTitle,
          createActivityLabel: UI_LABELS.es.activities.start.pageTitle,
          widgetsLabel: hub.widgetsLabel,
          weatherUnavailable: hub.weatherUnavailable,
          weatherAttribution: hub.weatherAttribution,
          levelShortcutTitle: hub.levelShortcutTitle,
        },
      },
      slots: { helper: '<div data-testid="helper-marker">helper</div>' },
    });

    // DOM/source position, not VISUAL order (that's `order-*`, asserted by
    // the test above — `DeskScene.astro`'s own widgets section already sits
    // BEFORE the dock in raw source, same as always, and only renders after
    // it on screen via `order-5`). What this test actually proves: the
    // slotted child lands right after the dock, still INSIDE `<section
    // data-desk>` — the SAME flex container as the dock/widgets/etc, which
    // is what lets its own `order-*` class (the real `DeskHelper`'s own
    // `order-4`) take effect among those siblings at all.
    const dockIdx = htmlWithSlot.indexOf('data-desk-dock');
    const markerIdx = htmlWithSlot.indexOf('data-testid="helper-marker"');
    const deskSectionCloseIdx = htmlWithSlot.lastIndexOf('</section>');

    expect(markerIdx).toBeGreaterThan(dockIdx);
    expect(markerIdx).toBeLessThan(deskSectionCloseIdx);
  });

  it('keeps the widgets a 2-column grid and the levels dock horizontally scrollable on phones (no overlap, no clipping)', async () => {
    const html = await render();

    const widgetsMatch = html.match(new RegExp(`<section aria-label="${hub.widgetsLabel}" class="([^"]*)"`));
    expect(widgetsMatch?.[1]).toContain('grid-cols-2');

    const dockMatch = html.match(/<div[^>]*data-desk-dock[^>]*class="([^"]*)"/);
    expect(dockMatch?.[1]).toContain('overflow-x-auto');
    expect(dockMatch?.[1]).toContain('max-w-full');
  });

  // Mobile-layout polish round (owner report: "Frase del día" squeezed into
  // a half-width column, title/quote wrapping word by word). Full width on
  // phones like the weather widget, restored to its original single
  // (320px) desktop column.
  it('gives the player widget the full row width on phones, like weather — clock/calendar stay the 2-column pair', async () => {
    const html = await render();

    const playerMatch = html.match(/<div data-desk-widget="player" class="([^"]*)"/);
    expect(playerMatch).not.toBeNull();
    const playerTokens = playerMatch![1].split(/\s+/);
    expect(playerTokens).toContain('col-span-2');
    expect(playerTokens).toContain('desk:col-span-1');
    expect(playerTokens).toContain('desk:w-[320px]');

    const weatherMatch = html.match(/<div id="desk-weather"[^>]*class="([^"]*)"/);
    expect(weatherMatch).not.toBeNull();
    expect(weatherMatch![1].split(/\s+/)).toContain('col-span-2');
  });

  // Mobile-layout polish round (owner report: B2 cut mid-item at the right
  // edge, C1/C2 fully hidden, no affordance). 360-1099px: six equal-width
  // tiles fill one row, no scroll. Below 360px: the original fixed-width
  // scroller, now with scroll-snap and a right-edge fade affordance.
  // `desk:` (1100px+) is untouched either way.
  it('fits all six level tiles in one row at >=360px (equal width, no scroll), keeps the original fixed-width scroller with a fade below 360px, desktop untouched', async () => {
    const html = await render();

    const dockMatch = html.match(/<div[^>]*data-desk-dock[^>]*class="([^"]*)"/);
    const dockTokens = dockMatch![1].split(/\s+/);
    expect(dockTokens).toContain('snap-x');
    expect(dockTokens).toContain('snap-mandatory');
    expect(dockTokens).toContain('[mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]');
    expect(dockTokens).toContain('min-[360px]:max-desk:overflow-visible');
    expect(dockTokens).toContain('min-[360px]:max-desk:[mask-image:none]');
    expect(dockTokens).toContain('desk:[mask-image:none]'); // desktop never shows the fade

    const navMatch = html.match(/<nav aria-label="Ir directo a tu nivel" class="([^"]*)"/);
    const navTokens = navMatch![1].split(/\s+/);
    expect(navTokens).toContain('min-[360px]:max-desk:flex-1');
    expect(navTokens).toContain('min-[360px]:max-desk:w-full');

    // `href="/es/ingles/actividades?nivel=…"` is unique to the six level
    // tiles — `data-desk-window-open="community"` alone would ALSO match
    // the (unrelated) community folder link above.
    const itemMatches = [...html.matchAll(/<a href="\/es\/ingles\/actividades\?nivel=[^"]*"[^>]*class="([^"]*)"/g)];
    expect(itemMatches.length).toBe(6); // the six CEFR levels
    for (const match of itemMatches) {
      const tokens = match[1].split(/\s+/);
      expect(tokens).toContain('w-[76px]'); // below 360px: original fixed width, unchanged
      expect(tokens).toContain('snap-start');
      expect(tokens).toContain('min-[360px]:max-desk:flex-1'); // 360-1099px: equal width, fills the row
      expect(tokens).toContain('min-[360px]:max-desk:w-auto');
    }
  });
});
