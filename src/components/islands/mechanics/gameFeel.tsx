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
 *   - `KeyboardSensor` plus `PointerSensor` cover keyboard, mouse, touch and
 *     pen with no extra wiring (same pairing `DropRenderer.tsx` already
 *     uses).
 *
 * WHAT THIS MODULE ADDS ON TOP:
 *   - `liftedTileClassName` — the lifted-tile look itself (scale, deeper
 *     shadow, a slight raise) for whichever tile is in `DragOverlay`;
 *   - `gameDropAnimation` — the ~180ms ease-out timing for the snap/return,
 *     `null` (instant, no animation) under `prefers-reduced-motion`;
 *   - `useFlip` — FLIP-style reflow for a tray/list whose children shift
 *     position when one leaves or returns (a tile placed, or bounced back),
 *     so the REMAINING tiles glide into their new slot instead of popping;
 *   - `useGameDndSensors` — the shared sensor pair;
 *   - `GameSoundToggle` — the speaker mute button for the game chrome,
 *     wired straight to `gameSounds.ts`'s `useGameSound`.
 */
import { useLayoutEffect, useRef, type RefObject } from 'react';
import {
  KeyboardSensor,
  PointerSensor,
  defaultDropAnimationSideEffects,
  useSensor,
  useSensors,
  type DropAnimationSideEffects,
} from '@dnd-kit/core';
import { SpeakerHighIcon } from '@phosphor-icons/react/dist/ssr/SpeakerHigh';
import { SpeakerSlashIcon } from '@phosphor-icons/react/dist/ssr/SpeakerSlash';
import { cn } from '@/lib/utils';

/** How long the eased snap/return takes — the owner's "~180ms ease-out" ask. */
export const GAME_DROP_ANIMATION_MS = 180;

/** A gentle overshoot ease — a snap with a little life in it, not a linear slide. */
const GAME_DROP_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

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

/**
 * The lifted-tile look for whichever tile a `DragOverlay` is currently
 * showing: scaled up (~1.04), a deeper shadow, a slight z-raise. No
 * scale/shadow at all under reduced motion — "no scaling/animations,
 * instant moves" (owner spec).
 */
export function liftedTileClassName(reducedMotion: boolean): string {
  if (reducedMotion) return '';
  return 'scale-[1.04] shadow-xl';
}

/** Transition classes for a tile that is NOT in the overlay (its resting/placed state) — omitted entirely under reduced motion. */
export function gameTileTransitionClassName(reducedMotion: boolean): string {
  return reducedMotion ? '' : 'transition-shadow duration-150 ease-out';
}

/**
 * The shared sensor pair every drag-based game template wants: a pointer
 * sensor with a short activation distance (a plain click/tap still reaches
 * `onClick` instead of starting a zero-length drag — same reasoning
 * `DropRenderer.tsx` documents) plus the keyboard sensor, covering mouse,
 * touch, pen and keyboard with nothing extra per caller.
 */
export function useGameDndSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
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
