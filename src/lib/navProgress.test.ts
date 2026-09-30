// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  NavProgressController,
  applyNavProgressState,
  initNavProgressBar,
  NAV_PROGRESS_BAR_ID,
  type NavProgressState,
} from './navProgress';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('NavProgressController — fast navigation never flashes', () => {
  it('stays invisible (idle/pending) until revealDelay has elapsed', () => {
    const states: NavProgressState[] = [];
    const controller = new NavProgressController((s) => states.push(s));

    controller.start();
    expect(states.at(-1)).toEqual({ phase: 'pending', progress: 0 });

    vi.advanceTimersByTime(119);
    expect(states.at(-1)).toEqual({ phase: 'pending', progress: 0 });
  });

  it('completing before the reveal delay elapses never reveals the bar at all', () => {
    const states: NavProgressState[] = [];
    const controller = new NavProgressController((s) => states.push(s));

    controller.start();
    controller.complete();

    expect(states.at(-1)).toEqual({ phase: 'idle', progress: 0 });
    expect(states.some((s) => s.phase === 'active')).toBe(false);
  });
});

describe('NavProgressController — reveal + trickle', () => {
  it('reveals at revealDelay and trickles toward, but never past, 90%', () => {
    const states: NavProgressState[] = [];
    const controller = new NavProgressController((s) => states.push(s));

    controller.start();
    vi.advanceTimersByTime(120);
    expect(states.at(-1)).toEqual({ phase: 'active', progress: 20 });

    vi.advanceTimersByTime(200);
    expect(states.at(-1)?.phase).toBe('active');
    expect(states.at(-1)?.progress).toBeGreaterThan(20);
    expect(states.at(-1)?.progress).toBeLessThanOrEqual(90);

    // Even after a long time trickling, it never reaches (let alone passes) 90.
    vi.advanceTimersByTime(200 * 50);
    expect(states.at(-1)?.progress).toBeLessThanOrEqual(90);
  });

  it('reveals straight to a fixed width and never trickles under reducedMotion', () => {
    const states: NavProgressState[] = [];
    const controller = new NavProgressController((s) => states.push(s), { reducedMotion: true });

    controller.start();
    vi.advanceTimersByTime(120);
    const revealed = states.at(-1);
    expect(revealed?.phase).toBe('active');

    vi.advanceTimersByTime(200 * 10);
    expect(states.at(-1)).toEqual(revealed);
  });
});

describe('NavProgressController — complete', () => {
  it('jumps to 100%, holds, then fades out back to idle', () => {
    const states: NavProgressState[] = [];
    const controller = new NavProgressController((s) => states.push(s));

    controller.start();
    vi.advanceTimersByTime(120);
    controller.complete();
    expect(states.at(-1)).toEqual({ phase: 'completing', progress: 100 });

    vi.advanceTimersByTime(150);
    expect(states.at(-1)).toEqual({ phase: 'fading', progress: 100 });

    vi.advanceTimersByTime(200);
    expect(states.at(-1)).toEqual({ phase: 'idle', progress: 0 });
  });

  it('stops the trickle once complete() has been called', () => {
    const states: NavProgressState[] = [];
    const controller = new NavProgressController((s) => states.push(s));

    controller.start();
    vi.advanceTimersByTime(120);
    controller.complete();
    const countAtComplete = states.length;

    vi.advanceTimersByTime(200 * 5);
    // Only the fade-out (150ms hold) and reset transitions fire after this —
    // no stray trickle ticks sneak in once phase is no longer 'active'.
    expect(states.length).toBeLessThan(countAtComplete + 5);
  });

  it('is a no-op once already idle or fading', () => {
    const states: NavProgressState[] = [];
    const controller = new NavProgressController((s) => states.push(s));

    controller.complete();
    expect(states).toEqual([]);
  });
});

describe('NavProgressController — abort (cancelled/failed navigation)', () => {
  it('fades out from wherever it was — never jumps to 100%', () => {
    const states: NavProgressState[] = [];
    const controller = new NavProgressController((s) => states.push(s));

    controller.start();
    vi.advanceTimersByTime(120);
    controller.abort();

    expect(states.some((s) => s.progress === 100)).toBe(false);
    expect(states.at(-1)?.phase).toBe('fading');

    vi.advanceTimersByTime(200);
    expect(states.at(-1)).toEqual({ phase: 'idle', progress: 0 });
  });

  it('aborting before the reveal delay elapses never reveals the bar', () => {
    const states: NavProgressState[] = [];
    const controller = new NavProgressController((s) => states.push(s));

    controller.start();
    controller.abort();

    expect(states.at(-1)).toEqual({ phase: 'idle', progress: 0 });
  });
});

describe('NavProgressController — dispose', () => {
  it('stops every pending timer, so no further onChange calls happen', () => {
    const onChange = vi.fn();
    const controller = new NavProgressController(onChange);

    controller.start();
    vi.advanceTimersByTime(120);
    const callsBeforeDispose = onChange.mock.calls.length;
    controller.dispose();

    vi.advanceTimersByTime(10_000);
    expect(onChange.mock.calls.length).toBe(callsBeforeDispose);
  });
});

describe('applyNavProgressState', () => {
  it('sets width from progress and shows the bar only while active/completing', () => {
    const bar = document.createElement('div');

    applyNavProgressState(bar, { phase: 'active', progress: 42 });
    expect(bar.style.width).toBe('42%');
    expect(bar.style.opacity).toBe('1');

    applyNavProgressState(bar, { phase: 'completing', progress: 100 });
    expect(bar.style.opacity).toBe('1');

    applyNavProgressState(bar, { phase: 'fading', progress: 100 });
    expect(bar.style.opacity).toBe('0');

    applyNavProgressState(bar, { phase: 'idle', progress: 0 });
    expect(bar.style.opacity).toBe('0');
    expect(bar.style.width).toBe('0%');
  });
});

describe('initNavProgressBar — real event wiring (jsdom cannot run real view transitions, so we dispatch the Astro events directly)', () => {
  function withBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.id = NAV_PROGRESS_BAR_ID;
    document.body.appendChild(bar);
    return bar;
  }

  afterEach(() => {
    document.getElementById(NAV_PROGRESS_BAR_ID)?.remove();
  });

  it('does nothing and returns undefined when the bar element is not present', () => {
    expect(initNavProgressBar(document, window)).toBeUndefined();
  });

  it('starts on astro:before-preparation and completes on astro:page-load', () => {
    const bar = withBar();
    const dispose = initNavProgressBar(document, window);

    document.dispatchEvent(new Event('astro:before-preparation'));
    vi.advanceTimersByTime(120);
    expect(bar.style.opacity).toBe('1');
    expect(Number(bar.style.width.replace('%', ''))).toBeGreaterThan(0);

    document.dispatchEvent(new Event('astro:page-load'));
    expect(bar.style.width).toBe('100%');

    vi.advanceTimersByTime(150 + 200);
    expect(bar.style.opacity).toBe('0');

    dispose?.();
  });

  it('aborts (fades out, never hits 100%) when the before-preparation signal aborts', () => {
    const bar = withBar();
    const dispose = initNavProgressBar(document, window);

    const controller = new AbortController();
    const event = new Event('astro:before-preparation') as Event & { signal: AbortSignal };
    event.signal = controller.signal;
    document.dispatchEvent(event);
    vi.advanceTimersByTime(120);
    expect(bar.style.opacity).toBe('1');

    controller.abort();
    expect(bar.style.width).not.toBe('100%');

    vi.advanceTimersByTime(200);
    expect(bar.style.opacity).toBe('0');

    dispose?.();
  });

  it('dispose() removes both listeners — a later event no longer moves the bar', () => {
    const bar = withBar();
    const dispose = initNavProgressBar(document, window);
    dispose?.();

    document.dispatchEvent(new Event('astro:before-preparation'));
    vi.advanceTimersByTime(120);
    expect(bar.style.width).toBe('0%');
  });

  it('respects prefers-reduced-motion: reduce — no matchMedia call throws, trickle is skipped', () => {
    const bar = withBar();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    const dispose = initNavProgressBar(document, window);
    document.dispatchEvent(new Event('astro:before-preparation'));
    vi.advanceTimersByTime(120);
    const widthAtReveal = bar.style.width;

    vi.advanceTimersByTime(200 * 5);
    expect(bar.style.width).toBe(widthAtReveal);

    dispose?.();
    Reflect.deleteProperty(window, 'matchMedia');
  });
});
