/**
 * gameFeel — the shared "game-feel" drag engine on top of dnd-kit (owner
 * ask: "quiero esa cara y movilidad que permite Wordwall: ... la suavidad
 * del movimiento"). `QuizMatching`'s "Une las parejas" board is the first
 * caller; this module is deliberately generic so the next drag-based
 * templates (Reordenar, Completar la frase, Ordenar por grupos) can reuse
 * the same lift/snap/return feel and the same mute-aware sound chrome
 * instead of each growing its own.
 *
 * WHAT DND-KIT ALREADY GIVES US, FOR FREE, WHEN USED THIS WAY:
 *   - a `DragOverlay` tile tracks the pointer/touch position every frame —
 *     that IS "the tile following the pointer smoothly", no extra code;
 *   - `DragOverlay`'s own `dropAnimation` eases the overlay from the pointer
 *     to wherever the REAL draggable with the same `id` now sits in the DOM
 *     once `onDragEnd` has updated state — so as long as a successfully
 *     placed tile keeps the SAME `useDraggable` id in its new (slot) spot
 *     that it had in its old (tray) spot, this reads as an eased "snap into
 *     the target"; dropped outside (no state change) it reads as an eased
 *     "return to origin" instead, both from the one `dropAnimation` config;
 *   - `KeyboardSensor` plus `MouseSensor`/`TouchSensor` cover keyboard,
 *     mouse and touch with no extra wiring.
 *
 * WHAT THIS MODULE ADDS ON TOP:
 *   - `gameCollisionDetection` — the shared collision strategy (pointer-
 *     containment first, see its own header for why);
 *   - `liftedTileClassName` — the lifted-tile look itself (scale, tilt,
 *     deeper shadow, a slight raise) for whichever tile is in `DragOverlay`;
 *   - `useDragSourceMetrics` — copies the real drag SOURCE tile's own
 *     computed box onto the overlay chip, so it renders at the source
 *     tile's exact size wherever it is portaled to (see `GameDragOverlay`'s
 *     own "SIZE" header);
 *   - `dragCursorClassName` / `useGrabCursor` — the grab/grabbing cursor
 *     affordance, on the tile and on the whole document while dragging;
 *   - `gameDropAnimation` — the ~200ms ease-out timing for the snap/return,
 *     `null` (instant, no animation) under `prefers-reduced-motion`;
 *   - `useFlip` — FLIP-style reflow for a tray/list whose children shift
 *     position when one leaves or returns (a tile placed, or bounced back),
 *     so the REMAINING tiles glide into their new slot instead of popping;
 *   - `useGameDndSensors` — the shared sensor trio;
 *   - `GameSoundToggle` — the speaker mute button for the game chrome,
 *     wired straight to `gameSounds.ts`'s `useGameSound`.
 */
import {
  cloneElement,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import {
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  defaultDropAnimationSideEffects,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DropAnimationSideEffects,
} from '@dnd-kit/core';
import { SpeakerHighIcon } from '@phosphor-icons/react/dist/ssr/SpeakerHigh';
import { SpeakerSlashIcon } from '@phosphor-icons/react/dist/ssr/SpeakerSlash';
import { cn } from '@/lib/utils';

/** How long the eased snap/return takes — the owner's "~200ms ease-out, so the release settles instead of snapping" ask. */
const GAME_DROP_ANIMATION_MS = 200;

/** A plain decelerate — settles into place with no overshoot, which reads as a landing rather than a snap. */
const GAME_DROP_EASING = 'cubic-bezier(0.2, 0.9, 0.3, 1)';

/** The shape `gameDropAnimation` returns — `DragOverlay`'s own `DropAnimationOptions` is not re-exported by `@dnd-kit/core`, so this mirrors it structurally. */
export interface GameDropAnimationConfig {
  duration: number;
  easing: string;
  sideEffects: DropAnimationSideEffects;
}

/**
 * `dropAnimation` for a `DragOverlay`: the eased snap-into-target / return-
 * to-origin described in this file's own header. `null` under reduced
 * motion — the overlay then simply disappears and the real DOM (already
 * updated by `onDragEnd`) is what the learner sees, i.e. an instant move.
 */
export function gameDropAnimation(reducedMotion: boolean): GameDropAnimationConfig | null {
  if (reducedMotion) return null;
  return {
    duration: GAME_DROP_ANIMATION_MS,
    easing: GAME_DROP_EASING,
    sideEffects: defaultDropAnimationSideEffects({
      styles: { active: { opacity: '0.4' } },
    }),
  };
}

export interface GameDragOverlayProps {
  /** Forwarded straight to dnd-kit's own `DragOverlay` — see {@link gameDropAnimation}. */
  dropAnimation: GameDropAnimationConfig | null;
  /** The lifted tile's own markup, or `null` while nothing is being dragged — same ternary every caller already built for its own (former, inline) `DragOverlay`. */
  children: ReactNode;
  /** The caller's own `activeId` state (the id of the tile currently being dragged, `null` while idle) — every mold already keeps this locally for `useGrabCursor`. Forwarded to {@link useDragSourceMetrics}; see this component's own "SIZE" header for what it is used for. */
  activeId: string | null;
}

/**
 * {@link useDragSourceMetrics}'s own return shape.
 */
export interface DragSourceMetrics {
  /** The drag source's own computed box, copied onto the overlay chip as inline styles — see `GameDragOverlay`'s own "SIZE" header. */
  style: CSSProperties;
  /** `sourceEl.getBoundingClientRect().width / sourceEl.offsetWidth` — `1` outside any `transform: scale(s)` ancestor, that same `s` inside one (the editor's own live preview). Applied to the overlay's OUTER wrapper, never the chip itself. */
  scale: number;
}

/**
 * Reads the drag SOURCE tile's own computed box the moment it becomes
 * `activeId` — see `GameDragOverlay`'s own "SIZE" header for the full story
 * of why this exists instead of sizing the overlay chip from CSS alone.
 * Found by `data-flip-id` (already on every draggable/placed tile in all
 * four molds, `useFlip`'s own attribute), so no mold has to thread a ref in
 * just for this — only its own `activeId` state, already local to every
 * caller.
 *
 * `useLayoutEffect`, not `useEffect`: must resolve before the browser paints
 * the first overlay frame, same reasoning `insetHost`'s own measurement
 * effect gives below — a one-frame flash of the wrong size would otherwise
 * be visible.
 *
 * `null` while idle, on the server (no `document`), and if no element
 * carries a matching `data-flip-id` (defensive only — never happens from a
 * real mold).
 */
export function useDragSourceMetrics(activeId: string | null): DragSourceMetrics | null {
  const [metrics, setMetrics] = useState<DragSourceMetrics | null>(null);

  useLayoutEffect(() => {
    if (!activeId || typeof document === 'undefined') {
      setMetrics(null);
      return;
    }
    // Plain attribute equality on `dataset.flipId`, not a `[data-flip-id="…"]`
    // selector string: an id can contain characters (`:`, quotes) that would
    // need CSS-selector escaping, and `CSS.escape` is not guaranteed to exist
    // in every host (missing outright in this codebase's own jsdom test
    // environment) — no reason to depend on it for a plain string compare.
    const sourceEl = Array.from(document.querySelectorAll<HTMLElement>('[data-flip-id]')).find(
      (el) => el.dataset.flipId === activeId,
    );
    if (!sourceEl) {
      setMetrics(null);
      return;
    }
    const computed = getComputedStyle(sourceEl);
    const rect = sourceEl.getBoundingClientRect();
    const { offsetWidth, offsetHeight } = sourceEl;
    setMetrics({
      style: {
        width: `${offsetWidth}px`,
        height: `${offsetHeight}px`,
        fontSize: computed.fontSize,
        lineHeight: computed.lineHeight,
        paddingTop: computed.paddingTop,
        paddingRight: computed.paddingRight,
        paddingBottom: computed.paddingBottom,
        paddingLeft: computed.paddingLeft,
        borderRadius: computed.borderRadius,
      },
      // `offsetWidth` is `0` for a detached/display:none element — falls
      // back to `1` (no scale) rather than dividing by zero.
      scale: offsetWidth > 0 ? rect.width / offsetWidth : 1,
    });
  }, [activeId]);

  return metrics;
}

/**
 * The drag-overlay layer — kept ABOVE every other positioned layer the app
 * currently has, walked bottom-up: ordinary positioned chrome (badges,
 * dropdowns, tooltips…) sits at `z-10`–`z-30`; the sticky header and
 * `BottomSheet`'s own bar/overlay at `z-40`; the kit's `Dialog`, the desk
 * window itself (`DeskWindow.astro`'s own `.ingles-window`) and
 * `NavProgressBar` at `z-50`; the minimized-windows tray, the editor's own
 * side dock and `GameResult`'s own confetti/medal portal at `z-[60]`; the
 * focus-mode shell (`ActivityPracticeIsland.tsx`'s own fullscreen div) at
 * `z-[80]`, the highest of the rest. `90` clears all of them with room to
 * spare.
 *
 * Kept as ONE named constant — used for `insetHost`'s own class below AND
 * repeated as a literal number on the inner `<DragOverlay>`'s own `zIndex`
 * prop (dnd-kit's prop takes a plain number, never a class), so both read as
 * the SAME deliberate layer instead of two independently-chosen ones.
 * `z-index-layer-budget.test.ts` (`src/styles/`) statically scans every
 * OTHER `z-*`/`zIndex` value in `src/**` and fails if one climbs to or past
 * this same number without an explicit, reasoned allowlist entry — so a
 * future layer can never silently hide this one again the way `insetHost`'s
 * own MISSING z-index just did (see this component's own "LAYER" header
 * below).
 */
export const DRAG_LAYER_CLASS = 'z-[90]';

/**
 * The shared `DragOverlay` for every drag-based game template — ALWAYS
 * portals its content to `document.body` (or, see FULLSCREEN below, the
 * real Fullscreen API element) rather than letting it render inline inside
 * whichever mold's own tree calls it.
 *
 * WHY: dnd-kit's own `DragOverlay` is `position: fixed` positioned with
 * VIEWPORT coordinates (`rect.top`/`rect.left`, from `getBoundingClientRect`
 * on the real dragged tile — always viewport-relative). But per the CSS
 * Containment spec, a `contain: layout` (or `transform`) ANCESTOR becomes
 * the containing block for every `fixed` descendant regardless of that
 * descendant's own position value. `ActivityStage` is exactly such an
 * ancestor (see its own header), so an inline `DragOverlay` resolved its
 * `top`/`left` against the STAGE's own box instead of the viewport —
 * offsetting the lifted tile away from the real pointer (owner report: "la
 * pastilla queda por debajo del mouse", screenshot
 * `match-mid-drag-lift-tilt-cursor.png`). Inside the template editor's own
 * live preview, `ActivityPreviewFrame` ALSO wraps the board in `transform:
 * scale(s)` — another containing-block trigger — so there the overlay was
 * offset AND scaled. `createPortal` to `document.body` is dnd-kit's own
 * documented fix: escaping every ancestor restores `position: fixed`'s
 * normal viewport-relative behaviour.
 *
 * SIZE (covers the editor's own preview scale too, WITHOUT reading it):
 * dnd-kit's own positioning wrapper (`PositionedOverlay`, `@dnd-kit/core`)
 * already sets explicit `width`/`height` on ITSELF from the REAL dragged
 * tile's measured `getBoundingClientRect()` — which is the tile's own
 * PAINTED (post-transform) box, i.e. already the correctly SHRUNK size
 * inside `ActivityPreviewFrame`'s `transform: scale(s)`, and the plain
 * native size everywhere else. THREE measured earlier attempts all missed:
 * (1) reapplying that same `scale(s)` (via a new context) to a NATIVE-size
 * wrapper; (2) a bare `display: grid` wrapper at `100%` relying on grid's
 * default `stretch` to fill it — both measurably off in Playwright (±10px,
 * outside this task's own ±2px bar); and (3) `overflow: hidden` layered on
 * top of (2) (kept at `100%` of dnd-kit's own, already-correct box) to clip
 * the overflow (2) left instead of fixing the size — this one SHIPPED, and
 * was only caught from the real screenshots it was meant to verify: the clip
 * cut the pill's own right/bottom edges square, and in the editor's scaled
 * preview cut so much that a whole capsule read as a small circle with its
 * own label cut off — AND it clipped `liftedTileClassName`'s own
 * `scale-105`/`-rotate-2`/shadow the instant any of them pushed the chip's
 * painted box past (2)'s box, which is exactly what a "lifted" tile is
 * supposed to do. Root cause behind all three: the chip's own
 * `CHIP_STAGE_SIZE` padding/font/min-height (`chip.ts`) are `cqw`/`cqh`
 * (container query) tokens, resolved against the nearest
 * `[container-type:size]` ancestor (`scale.ts`'s `STAGE_CONTAINER_SIZE`,
 * wrapping the whole stage) — which, like `ActivityStage`'s own `[contain:
 * layout]`, is ALSO a `position: fixed` containing block (`container-type`
 * implies `contain: layout` too), so this component has to escape it right
 * alongside `ActivityStage`. Outside any such ancestor, `cqw`/`cqh` resolve
 * against the viewport instead (confirmed with `getComputedStyle` — NOT the
 * zero this codebase's own `scale.ts` assumed), which is usually BIGGER than
 * the stage, so the portaled chip renders bigger than dnd-kit's own box.
 *
 * THE ACTUAL FIX: stop resolving the chip's own size from any container at
 * all. {@link useDragSourceMetrics} reads the drag SOURCE tile — the real,
 * still-in-the-DOM draggable this overlay stands in for, found by its own
 * `data-flip-id` (already on every tile in all four molds, `useFlip`'s own
 * attribute — no ref has to be threaded in from any of them) — the moment it
 * becomes `activeId`, and copies its OWN computed `font-size`/`line-height`/
 * `padding-*`/`border-radius` plus its OWN layout size (`offsetWidth`/
 * `offsetHeight`) onto the overlay chip as plain inline styles: literal
 * pixels and computed values, never `cqw`/`cqh`. A chip styled this way is
 * exactly the source tile's own size regardless of whatever container (or
 * lack of one) it is portaled past — nothing left to stretch or clip, so
 * this component no longer wraps `children` in anything that could.
 *
 * The editor's own live preview still has to be matched visually: inside
 * `ActivityPreviewFrame`'s `transform: scale(s)`, the source tile's
 * `offsetWidth` (LAYOUT size, pre-transform) is bigger than its
 * `getBoundingClientRect().width` (PAINTED size, post-transform) by exactly
 * `s` — so {@link useDragSourceMetrics} also returns that ratio, applied
 * below as `transform: scale(s)` on an OUTER wrapper around the (native-
 * sized, still lifted) chip, `transformOrigin: 'top left'` — the same
 * recipe `ActivityPreviewFrame` itself already uses to shrink the whole
 * board. `1` (a no-op) everywhere else. The chip itself never scales: the
 * lift's own `scale-105` (`liftedTileClassName`) stays relative to the
 * chip's real, native-pixel size either way.
 *
 * GUTTER OFFSET (BLOCKER bugfix, "+10px on X"): `global.css`'s own `:root`
 * carries `scrollbar-gutter: stable both-edges` (~L727), which — per its
 * own comment there — ALSO shrinks the initial containing block (ICB) a
 * `fixed` box with no other containing-block trigger in between resolves
 * `top`/`left` against, by the reserved gutter's width on the left edge too
 * (the `both-edges` half of that rule). `global.css` already turns the
 * reservation off for the desk window and presentation mode
 * (`:root:has([data-desk-window])`/`[data-presentation-viewport]`, same
 * file) — safe there because BOTH always lock `<body>` from scrolling, so
 * the reservation protects nothing in either case. `ActivityStage` (this
 * overlay's own usual neighbour) does NOT share that guarantee: it also
 * renders in the ordinary, still-scrollable course-lesson frame and the
 * template editor's own live preview, where turning the SAME reservation
 * off page-wide would bring back the asymmetric grey-strip/layout-jump bug
 * `both-edges` exists to prevent. So this overlay compensates for ITSELF
 * instead, with `insetHost` — a `fixed inset-0` box subject to the EXACT
 * SAME ICB shift, so `getBoundingClientRect().left` on it reports the
 * shift's size directly: no magic constant, no dependency on any
 * particular scrollbar width/OS/zoom. `translateX(-offset)` then slides it
 * back onto the true viewport edge, and because a `transform` ALSO creates
 * a containing block for `fixed` descendants (the same mechanism
 * `ActivityStage`'s own `[contain:layout]` uses, see above), the REAL
 * `DragOverlay` portaled INTO it now resolves against THIS corrected box
 * instead of the shifted root ICB. Measured on mount, on resize, and
 * whenever the portal target switches — NEVER toggled at drag start, which
 * would itself cause the very layout jump this is trying to avoid.
 *
 * `insetHost` is a PLAIN DOM node created and attached IMPERATIVELY
 * (`document.createElement` + a manual `appendChild`/`removeChild`
 * effect), exactly like this file's own sibling pattern,
 * `ActivityPracticeIsland`'s `focusModeHost` — NEVER through JSX. Bugfix:
 * an EARLIER version of this fix wrapped `<DragOverlay>` in an ordinary
 * `<div>` rendered straight in this component's JSX, portaled the same way
 * `<DragOverlay>` alone already was. That div was unconditionally present
 * (unlike `<DragOverlay>` itself, which renders nothing in dnd-kit while
 * idle — `NullifiedContextProvider > AnimationManager > null`, no DOM at
 * all), so it was a REAL node this component's React tree inserted into
 * `document.body` on first mount — and React 19 flagged that as a
 * hydration mismatch (`document` is undefined during SSR, so nothing
 * server-rendered could ever match it). Creating the SAME box outside
 * React's own render/hydration bookkeeping sidesteps that entirely: only
 * `<DragOverlay>`'s own portaled content is part of this component's JSX,
 * identical in shape to before this fix.
 *
 * FULLSCREEN ("modo enfoque"): while the browser's real Fullscreen API is
 * engaged, `document.body` content OUTSIDE the fullscreen element is not
 * painted AT ALL — portaling there would make the lifted tile invisible.
 * Mirrors `ActivityPracticeIsland`'s own `fullscreenchange` listener (its
 * `focusModeHost`/`focusModeContainer` plumbing): this reads `document.
 * fullscreenElement` itself and portals into IT whenever one is set, falling
 * back to `document.body` otherwise — including the CSS-fallback "modo
 * enfoque" (no real Fullscreen API, just a `fixed`, high-z-index overlay),
 * where `document.body` paints normally and this overlay's own `zIndex={90}`
 * already layers above it (same convention `GameResult`'s own character
 * portal uses).
 *
 * LAYER (BLOCKER bugfix — the dragged chip was invisible on every real
 * activity page): `insetHost` itself used to carry NO z-index at all
 * (`fixed inset-0 pointer-events-none`, i.e. `z-index: auto`), so it painted
 * BELOW every OTHER positioned sibling `document.body` already has with an
 * explicit z-index — the activity window itself (`DeskWindow.astro`'s own
 * `.ingles-window`, `z-50`) chief among them. The INNER `<DragOverlay>`
 * below never got a chance to compete: z-index only resolves against
 * SIBLINGS within the same stacking context, and `insetHost` (this
 * component's own portal target) is the sibling that actually matters here
 * — once it loses, nothing portaled inside it can still win. Only caught in
 * the real app: the TEMP dev harness (`/dev-plantillas`) has no window
 * chrome at all, so it never reproduced there. Confirmed live by giving the
 * host an explicit z-index and watching the chip reappear instantly, mouse
 * and touch alike. {@link DRAG_LAYER_CLASS} (see its own header just above
 * this component) now carries the host comfortably above every other layer
 * in the app, and the inner `<DragOverlay>` repeats the same number for the
 * reason given there.
 *
 * Deliberately NOT a ceiling this constant has to clear: `UserMenu.tsx`'s
 * own dropdown and `deskWindowManager.ts`'s own window-wrapper tokens sit
 * intentionally even higher, but only on the desk HOST page — a different
 * same-origin IFRAME document from the activity page this overlay renders
 * in, where z-index can never cross that boundary (see each file's own
 * comment for its exact value).
 *
 * SSR-safe: `typeof document === 'undefined'` on the server, so `insetHost`
 * itself is `null` there and this renders nothing (same guard
 * `GameResult.tsx`'s own portal uses) — there is
 * nothing to drag before the client hydrates anyway.
 */
export function GameDragOverlay({ dropAnimation, children, activeId }: GameDragOverlayProps) {
  const [fullscreenElement, setFullscreenElement] = useState<Element | null>(() =>
    typeof document === 'undefined' ? null : document.fullscreenElement,
  );

  useEffect(() => {
    const onFullscreenChange = () => setFullscreenElement(document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // See GUTTER OFFSET above. Created once, imperatively — never re-created
  // on later renders (same one-time-`useState`-initializer shape
  // `focusModeHost` uses).
  const [insetHost] = useState<HTMLDivElement | null>(() => {
    if (typeof document === 'undefined') return null;
    const el = document.createElement('div');
    el.setAttribute('data-testid', 'game-drag-overlay-inset');
    // `DRAG_LAYER_CLASS` (see this file's own header just above this
    // component) — without it this host paints at `z-index: auto`, BELOW
    // every positioned sibling `document.body` already has with an
    // explicit one (the real bug this fixes, see this component's own
    // "LAYER" header).
    el.className = `fixed inset-0 pointer-events-none ${DRAG_LAYER_CLASS}`;
    return el;
  });

  useLayoutEffect(() => {
    if (!insetHost) return undefined;
    const parent = fullscreenElement ?? document.body;
    // Attach BEFORE measuring: `getBoundingClientRect()` on a detached node
    // always reads all-zero, not the real ICB shift.
    parent.appendChild(insetHost);
    const measure = () => {
      insetHost.style.transform = `translateX(${-insetHost.getBoundingClientRect().left}px)`;
    };
    measure();
    // `stable` keeps the reservation's own width constant while mounted, but
    // a zoom/display change could legitimately measure differently.
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      parent.removeChild(insetHost);
    };
  }, [insetHost, fullscreenElement]);

  // See this component's own "SIZE" header: the overlay chip's real size
  // comes from the drag SOURCE tile's own computed box, merged onto it
  // below — never from stretching/clipping to fit whatever container (or
  // lack of one) this overlay happens to be portaled past.
  const metrics = useDragSourceMetrics(activeId);
  let chip = children;
  if (metrics && isValidElement(children)) {
    const sourceChip = children as ReactElement<{ style?: CSSProperties }>;
    chip = cloneElement(sourceChip, { style: { ...sourceChip.props.style, ...metrics.style } });
  }

  if (!insetHost) return null;

  // Outside any `transform: scale(s)` ancestor (the ordinary player) `scale`
  // is exactly `1` — a no-op `transform` that would still force the browser
  // to promote this wrapper to its own compositing layer for nothing, so
  // it's omitted entirely rather than left in as the literal `scale(1)`.
  const scale = metrics?.scale ?? 1;
  const scaleWrapperStyle: CSSProperties =
    scale === 1 ? { transformOrigin: 'top left' } : { transform: `scale(${scale})`, transformOrigin: 'top left' };

  return createPortal(
    // `zIndex={90}` repeats {@link DRAG_LAYER_CLASS}'s own number literally
    // — dnd-kit's own prop takes a plain number, not a class — so both read
    // as the SAME deliberate layer. See this component's own "LAYER" header
    // above for why `insetHost` itself (not just this inner overlay) needs
    // one too.
    <DragOverlay dropAnimation={dropAnimation} zIndex={90}>
      {chip ? (
        // Shrinks the (now native-sized) chip down to match the editor's
        // own scaled live preview — see this component's own "SIZE" header.
        // Deliberately nothing here clips: the chip's own lift (scale,
        // tilt, shadow) must stay fully visible, never cut to this
        // wrapper's own box.
        <div data-testid="game-drag-overlay-chip" style={scaleWrapperStyle}>
          {chip}
        </div>
      ) : null}
    </DragOverlay>,
    insetHost,
  );
}

/**
 * The lifted-tile look for whichever tile a `DragOverlay` is currently
 * showing (owner ask: "la animación del puntero debe sentirse agradable y
 * fluida" — a flat `scale` alone read as stiff): scaled up (1.05) WITH a
 * slight tilt (-2deg, the "picked up off the desk" read), a deeper layered
 * shadow composed from two existing elevation tokens (`--shadow-chip-
 * raised`, the same raised look a placed tile already gets, PLUS
 * `--shadow-elevation-3` underneath it for the extra lift) rather than the
 * generic Tailwind `shadow-xl` this replaces, and `will-change-transform`
 * so the browser promotes it to its own layer before the transform starts
 * moving every frame, instead of only after. No scale/tilt/shadow at all
 * under reduced motion — "no scaling/animations, instant moves" (owner
 * spec). Deliberately no `transition-*` of its own: the `DragOverlay` child
 * this is applied to must track the pointer 1:1, with zero lag.
 */
export function liftedTileClassName(reducedMotion: boolean): string {
  if (reducedMotion) return '';
  return 'scale-105 -rotate-2 shadow-[var(--shadow-chip-raised),var(--shadow-elevation-3)] will-change-transform';
}

/**
 * Transition classes for a tile that is NOT in the overlay (its resting/
 * placed state) — omitted entirely under reduced motion. Opacity is part of
 * this (not just shadow): the SOURCE tile that stays behind while its
 * `DragOverlay` clone follows the pointer fades to its own "ghost" look
 * (`opacity-40`, applied by each caller) — without transitioning opacity
 * too, that fade used to snap instantly instead of easing in.
 */
export function gameTileTransitionClassName(reducedMotion: boolean): string {
  return reducedMotion ? '' : 'transition-[opacity,box-shadow] duration-150 ease-out';
}

/**
 * The shared collision strategy for every drag-based game template (owner
 * complaint: "el área de suelta es demasiado ancha — si la sueltas afuera
 * pero cerca de una casilla, de todos modos entra"). `closestCenter` (what
 * every caller used before) always names the NEAREST droppable regardless
 * of actual overlap, so a tile released well outside every slot could still
 * "snap" into whichever one happened to be closest. `pointerWithin` only
 * ever returns a droppable the POINTER is literally inside, so a release
 * outside every slot correctly resolves to no target at all (`onDragEnd`'s
 * own `over` is `undefined`, same as any other miss) and the tile returns to
 * the tray instead of jumping into a near miss.
 *
 * Falls back to `rectIntersection` only when there is no pointer position at
 * all — `KeyboardSensor` moves the draggable by updating its own transform
 * and never fires a pointer event, so `pointerWithin` would otherwise never
 * find anything for a keyboard-only move; a rect/rect overlap test is the
 * closest equivalent there.
 */
export const gameCollisionDetection: CollisionDetection = (args) => {
  return args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args);
};

/**
 * Grab-cursor feedback for a draggable tile (part of the same "pleasant and
 * fluid pointer motion" ask `liftedTileClassName` documents — the cursor is
 * part of that read too, not just the tile's own motion): `cursor-grab` at
 * rest, `cursor-grabbing` for the one tile currently lifted. `draggable`
 * must be false for a tile a mould only ever lets go by tapping (e.g. a
 * placed word in `QuizReorder`'s own sentence line) — advertising a grab
 * gesture that does nothing would read worse than no affordance at all.
 * `CHIP_SHAPE`'s own `disabled:cursor-not-allowed` (`chip.ts`) still wins
 * over `cursor-grab` on a disabled tile: same two classes, different
 * Tailwind modifier, so both ship in the class list and the browser's own
 * `:disabled` specificity decides which one actually paints.
 */
export function dragCursorClassName(draggable: boolean, dragging: boolean): string {
  if (!draggable) return '';
  return dragging ? 'cursor-grabbing' : 'cursor-grab';
}

/**
 * Forces the WHOLE document's cursor to `grabbing` for as long as a tile is
 * being dragged. Without this, the browser falls back to whatever `cursor`
 * the element currently under the pointer declares the instant the pointer
 * crosses into a different one mid-drag (a slot, a gap, the tray) — the
 * grabbing cursor would flicker rather than hold for the whole gesture,
 * the opposite of "fluid". Restores the body's own previous inline cursor
 * (normally none) once dragging stops, the drag is cancelled, or the
 * component unmounts mid-drag.
 */
export function useGrabCursor(dragging: boolean): void {
  useEffect(() => {
    if (!dragging) return;
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = 'grabbing';
    return () => {
      document.body.style.cursor = previousCursor;
    };
  }, [dragging]);
}

/**
 * The shared sensor trio every drag-based game template wants, mouse and
 * touch kept DELIBERATELY SEPARATE (owner complaint: dragging felt rough on
 * phones) rather than one shared `PointerSensor`, which fires for both input
 * types and so could only ever apply ONE `activationConstraint` to both:
 * mouse stays instant (a short 4px activation distance, so a plain click
 * still reaches `onClick` instead of starting a zero-length drag — same
 * reasoning `DropRenderer.tsx` documents), while touch gets a short 200ms
 * press-and-hold with an 8px tolerance, so swiping to scroll the page is
 * never mistaken for the start of a drag. `MouseSensor`/`TouchSensor` bind
 * to their own native event (`mousedown`/`touchstart` respectively) rather
 * than the generic Pointer Events both mouse and touch otherwise raise, so
 * there is no risk of the same gesture activating both at once. Plus the
 * keyboard sensor, covering every remaining input with nothing extra per
 * caller.
 */
export function useGameDndSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
}

/**
 * FLIP-style reflow: when `signature` changes (e.g. a tray's own visible
 * item ids, joined into one string), every direct descendant of
 * `containerRef` carrying a `data-flip-id` attribute glides from its
 * PREVIOUS screen position to its new one instead of popping there — the
 * "remaining tiles reflow" half of the owner's drag-feel ask. A no-op
 * (skips measuring and animating) under reduced motion, in a browser with
 * no layout engine (SSR), or when `Element.animate` is unavailable.
 */
export function useFlip(containerRef: RefObject<HTMLElement | null>, signature: string, reducedMotion: boolean): void {
  const prevRects = useRef<Map<string, DOMRect>>(new Map());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const children = Array.from(container.querySelectorAll<HTMLElement>('[data-flip-id]'));

    if (!reducedMotion) {
      for (const child of children) {
        const id = child.dataset.flipId;
        if (!id) continue;
        const prev = prevRects.current.get(id);
        if (!prev) continue;
        const next = child.getBoundingClientRect();
        const dx = prev.left - next.left;
        const dy = prev.top - next.top;
        if ((dx || dy) && typeof child.animate === 'function') {
          child.animate(
            [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
            { duration: 220, easing: GAME_DROP_EASING },
          );
        }
      }
    }

    const next = new Map<string, DOMRect>();
    for (const child of children) {
      const id = child.dataset.flipId;
      if (id) next.set(id, child.getBoundingClientRect());
    }
    prevRects.current = next;
    // `containerRef` is a stable ref object, deliberately excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, reducedMotion]);
}

export interface GameSoundToggleProps {
  muted: boolean;
  onToggle: () => void;
  /** Accessible labels — short, caller-translated via `UI_LABELS`. */
  labelMute: string;
  labelUnmute: string;
  className?: string;
}

/**
 * The mute toggle for a game's own chrome (owner spec: "una ficha con
 * sonidos... con un botón para silenciar"). A plain icon button, shared so
 * every drag-based template shows the same control in the same spot.
 */
export function GameSoundToggle({ muted, onToggle, labelMute, labelUnmute, className }: GameSoundToggleProps) {
  const Icon = muted ? SpeakerSlashIcon : SpeakerHighIcon;
  return (
    <button
      type="button"
      data-testid="game-sound-toggle"
      aria-pressed={muted}
      aria-label={muted ? labelUnmute : labelMute}
      onClick={onToggle}
      className={cn(
        'flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        className,
      )}
    >
      <Icon aria-hidden="true" size={18} />
    </button>
  );
}
