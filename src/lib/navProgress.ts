/**
 * navProgress — the thin brand-yellow bar fixed at the top of the page,
 * driven by Astro's ClientRouter navigation events (navigation-without-
 * flicker PR).
 *
 * Split the same way `backNavigation.ts` is: a pure, fully unit-testable
 * state machine ({@link NavProgressController}, driven with fake timers —
 * no DOM) and a thin DOM-wiring function ({@link initNavProgressBar}) that
 * reads `document`/`window` and renders the controller's state into an
 * existing element (`NavProgressBar.astro` renders the element itself and
 * calls this from an inline module script).
 *
 * State machine, in order:
 *  - `astro:before-preparation` → `start()`: the bar stays INVISIBLE for
 *    `revealDelay` (default 120ms) so a fast navigation never flashes it.
 *  - Still pending after `revealDelay` → `active`: the bar appears and
 *    trickles toward 90% (never further — the LAST 10% is reserved for the
 *    real completion below), slowing its own steps as it approaches 90 so
 *    it never visually finishes before the navigation actually does.
 *  - `astro:page-load` (fires after the DOM swap and any new page scripts
 *    have run — the safest "navigation is actually done" signal) → `
 *    complete()`: jumps to 100%, holds briefly, then fades out.
 *  - An aborted/failed navigation (the `AbortSignal` `before-preparation`
 *    carries) → `abort()`: fades out from wherever it was, no 100% flash —
 *    that visual would claim a finish that never happened.
 *
 * `reducedMotion` (from `prefers-reduced-motion: reduce`) skips the
 * trickle interval entirely: the bar still appears/disappears, it just
 * never animates its own width in between.
 */

export type NavProgressPhase = 'idle' | 'pending' | 'active' | 'completing' | 'fading';

export interface NavProgressState {
  phase: NavProgressPhase;
  /** 0–100. Only meaningful once `phase` is past `pending`. */
  progress: number;
}

export interface NavProgressOptions {
  /** Delay before the bar becomes visible, ms — avoids a flash on a fast navigation. Default 120. */
  revealDelay?: number;
  /** Trickle tick interval, ms. Default 200. Ignored when `reducedMotion` is true. */
  trickleInterval?: number;
  /** How long the bar stays at 100% before fading out, ms. Default 150. */
  completeHold?: number;
  /** How long the fade-out phase lasts before resetting to idle, ms. Default 200 (matches the CSS transition `NavProgressBar.astro` declares). */
  fadeDuration?: number;
  /** Skips the trickle interval — the bar still appears/disappears, just without animating its own width. Default false. */
  reducedMotion?: boolean;
}

const DEFAULTS: Required<NavProgressOptions> = {
  revealDelay: 120,
  trickleInterval: 200,
  completeHold: 150,
  fadeDuration: 200,
  reducedMotion: false,
};

/** The trickle ceiling — the last stretch to 100% is reserved for a real `complete()`. */
const TRICKLE_CEILING = 90;
/** The bar's width the instant it is revealed (skips straight there under reduced motion). */
const REVEAL_PROGRESS = 20;

export class NavProgressController {
  private state: NavProgressState = { phase: 'idle', progress: 0 };
  private revealTimer: ReturnType<typeof setTimeout> | null = null;
  private trickleTimer: ReturnType<typeof setInterval> | null = null;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly opts: Required<NavProgressOptions>;
  private readonly onChange: (state: NavProgressState) => void;

  constructor(onChange: (state: NavProgressState) => void, options: NavProgressOptions = {}) {
    this.onChange = onChange;
    this.opts = { ...DEFAULTS, ...options };
  }

  getState(): NavProgressState {
    return { ...this.state };
  }

  /** A navigation started. Safe to call again mid-navigation (e.g. a second before-preparation before the first resolved) — it just restarts the cycle. */
  start(): void {
    this.clearTimers();
    this.state = { phase: 'pending', progress: 0 };
    this.emit();
    this.revealTimer = setTimeout(() => this.reveal(), this.opts.revealDelay);
  }

  /** The navigation finished successfully. */
  complete(): void {
    if (this.state.phase === 'idle' || this.state.phase === 'fading') return;
    this.clearTimers();
    if (this.state.phase === 'pending') {
      // Finished before the reveal delay even elapsed — never show anything.
      this.state = { phase: 'idle', progress: 0 };
      this.emit();
      return;
    }
    this.state = { phase: 'completing', progress: 100 };
    this.emit();
    this.fadeTimer = setTimeout(() => this.fadeOut(), this.opts.completeHold);
  }

  /** The navigation was aborted or failed — fade out from wherever it was, with no 100% flash. */
  abort(): void {
    if (this.state.phase === 'idle' || this.state.phase === 'fading') return;
    this.clearTimers();
    if (this.state.phase === 'pending') {
      this.state = { phase: 'idle', progress: 0 };
      this.emit();
      return;
    }
    this.fadeOut();
  }

  /** Stops every pending timer without emitting — for a teardown (`initNavProgressBar`'s returned disposer). */
  dispose(): void {
    this.clearTimers();
  }

  private reveal(): void {
    if (this.state.phase !== 'pending') return;
    this.state = { phase: 'active', progress: REVEAL_PROGRESS };
    this.emit();
    if (!this.opts.reducedMotion) {
      this.trickleTimer = setInterval(() => this.trickle(), this.opts.trickleInterval);
    }
  }

  private trickle(): void {
    if (this.state.phase !== 'active') return;
    const remaining = TRICKLE_CEILING - this.state.progress;
    const step = Math.max(1, remaining * 0.2);
    this.state = { ...this.state, progress: Math.min(TRICKLE_CEILING, this.state.progress + step) };
    this.emit();
  }

  private fadeOut(): void {
    this.clearTimers();
    // Preserves whatever `progress` already was — `complete()` set it to
    // 100 before scheduling this; `abort()` calls it directly, from
    // wherever the trickle had gotten to, so an aborted navigation never
    // flashes a 100% it never actually reached.
    this.state = { phase: 'fading', progress: this.state.progress };
    this.emit();
    this.fadeTimer = setTimeout(() => {
      this.state = { phase: 'idle', progress: 0 };
      this.emit();
    }, this.opts.fadeDuration);
  }

  private clearTimers(): void {
    if (this.revealTimer) {
      clearTimeout(this.revealTimer);
      this.revealTimer = null;
    }
    if (this.trickleTimer) {
      clearInterval(this.trickleTimer);
      this.trickleTimer = null;
    }
    if (this.fadeTimer) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  private emit(): void {
    this.onChange(this.getState());
  }
}

/** The `id` `NavProgressBar.astro` renders its bar element with, and {@link initNavProgressBar} looks it up by. */
export const NAV_PROGRESS_BAR_ID = 'nav-progress-bar';

/** Applies a {@link NavProgressState} to the bar element's inline style. Exported for direct testing without going through real timers/events. */
export function applyNavProgressState(bar: HTMLElement, state: NavProgressState): void {
  bar.style.width = `${state.progress}%`;
  bar.style.opacity = state.phase === 'active' || state.phase === 'completing' ? '1' : '0';
}

/**
 * Wires {@link NavProgressController} up to real ClientRouter events and an
 * existing bar element, found by {@link NAV_PROGRESS_BAR_ID}. No-ops (and
 * returns `undefined`) if that element isn't present. Returns a disposer
 * that removes both listeners and stops the controller's timers — mostly
 * for tests; the real page never tears this down, `document` outlives every
 * client-side navigation.
 */
export function initNavProgressBar(doc: Document = document, win: Window = window): (() => void) | undefined {
  const bar = doc.getElementById(NAV_PROGRESS_BAR_ID);
  if (!bar) return undefined;

  const reducedMotion = readReducedMotion(win);
  const controller = new NavProgressController((state) => applyNavProgressState(bar, state), { reducedMotion });
  applyNavProgressState(bar, controller.getState());

  function onBeforePreparation(event: Event): void {
    controller.start();
    const signal = (event as Event & { signal?: AbortSignal }).signal;
    signal?.addEventListener('abort', () => controller.abort());
  }

  function onPageLoad(): void {
    controller.complete();
  }

  doc.addEventListener('astro:before-preparation', onBeforePreparation);
  doc.addEventListener('astro:page-load', onPageLoad);

  return () => {
    doc.removeEventListener('astro:before-preparation', onBeforePreparation);
    doc.removeEventListener('astro:page-load', onPageLoad);
    controller.dispose();
  };
}

/** `matchMedia` does not exist in every environment (jsdom ships none) — treated as "no preference" rather than thrown. */
function readReducedMotion(win: Window): boolean {
  if (typeof win.matchMedia !== 'function') return false;
  try {
    return win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
