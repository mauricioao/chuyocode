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
  // widgets(4) -> footer (outside this component, in `BaseLayout.astro`).
  it('gives the greeting, folders, dock and widgets sections ascending mobile `order-*` values matching the owner spec, all restored on desktop via `desk:order-none`', async () => {
    const html = await render();

    const greetingMatch = html.match(/<div class="([^"]*desk:pointer-events-none[^"]*)"/);
    const foldersMatch = html.match(/<nav[^>]*data-desk-folders[^>]*class="([^"]*)"/);
    const dockMatch = html.match(/<div class="([^"]*desk:bottom-10[^"]*)"/);
    const widgetsMatch = html.match(new RegExp(`<section aria-label="${hub.widgetsLabel}" class="([^"]*)"`));

    expect(greetingMatch?.[1]).toContain('order-1');
    expect(foldersMatch?.[1]).toContain('order-2');
    expect(dockMatch?.[1]).toContain('order-3');
    expect(widgetsMatch?.[1]).toContain('order-4');

    for (const match of [greetingMatch, foldersMatch, dockMatch, widgetsMatch]) {
      expect(match?.[1]).toContain('desk:order-none');
    }
  });

  it('keeps the widgets a 2-column grid and the levels dock horizontally scrollable on phones (no overlap, no clipping)', async () => {
    const html = await render();

    const widgetsMatch = html.match(new RegExp(`<section aria-label="${hub.widgetsLabel}" class="([^"]*)"`));
    expect(widgetsMatch?.[1]).toContain('grid-cols-2');

    const dockMatch = html.match(/<div[^>]*data-desk-dock[^>]*class="([^"]*)"/);
    expect(dockMatch?.[1]).toContain('overflow-x-auto');
    expect(dockMatch?.[1]).toContain('max-w-full');
  });
});
