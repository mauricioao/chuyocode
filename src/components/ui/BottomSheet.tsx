/**
 * BottomSheet — the reusable mobile sheet behind the "Mobile layout" pass:
 * the practice page's per-zone editor, the editor's properties panel, and
 * the community filters bar all mount this one component instead of each
 * growing its own modal.
 *
 * Built on Radix's `Dialog` primitive (already a dependency — see
 * `src/components/ui/dialog.tsx`) rather than reimplementing focus trap,
 * Escape-to-close, or backdrop-tap-to-close: Radix already gives every one
 * of those for free through `role="dialog"` + `Dialog.Content`. This
 * component only adds what Radix's plain (centered) `DialogContent` does
 * not: bottom-anchored positioning, a drag handle, and swipe-down-to-close
 * (pure math in `src/lib/bottomSheetGesture.ts`, this file is only the
 * pointer-event wiring around it — same "pure math, dumb component" split
 * already used by the worksheet canvas).
 *
 * TWO SHAPES, one component:
 *  - `open`/`onOpenChange` only (no `peek`): a plain modal sheet — hidden
 *    entirely while closed, full modal (backdrop + focus trap) while open.
 *    Used by the practice page's per-zone sheet and the community filters
 *    sheet.
 *  - `open`/`onOpenChange` WITH `peek`: a persistent, NON-modal collapsed
 *    bar (`peek`'s content, tap or drag up to expand — no backdrop, no
 *    focus trap, nothing else on the page is blocked) that turns into the
 *    full modal sheet once `open` is true. Used by the editor's properties
 *    panel, which must stay visible (if collapsed) even with nothing
 *    selected, unlike a normal dialog that is either mounted or not.
 *
 * SWIPE DOWN TO CLOSE: a pointer drag starting on the handle grows a live
 * `translateY` (clamped to never go negative — see `dragTranslateY`) that
 * moves the whole sheet with the finger; releasing it either snaps back to
 * `0` or, past `shouldDismissSheet`'s distance/velocity threshold, calls
 * `onOpenChange(false)`. `prefers-reduced-motion` drops the snap-back
 * transition to an instant jump instead of an animated slide — the OPEN/
 * CLOSE mount transition itself is Radix's own `data-[state]` CSS (see
 * `dialog.tsx`), which already inherits the same `motion-reduce:` rule from
 * `src/styles/global.css`'s global `prefers-reduced-motion` handling... this
 * component only needs to own the one transition IT introduces (the drag
 * snap-back), so it reads the media query directly rather than assuming a
 * global rule exists for a translate it applies inline.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';
import { dragTranslateY, dragVelocity, shouldDismissSheet, type DragSample } from '@/lib/bottomSheetGesture';

export interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible title — required by Radix's `Dialog.Title`; pass `titleHidden` to keep it visually hidden when the sheet already shows its own heading in `children`. */
  title: string;
  titleHidden?: boolean;
  children: React.ReactNode;
  /**
   * A persistent, non-modal collapsed bar shown while `open` is false —
   * see the file header's "two shapes". Tapping it calls `onOpenChange(true)`.
   * Omit entirely for a plain modal-only sheet.
   */
  peek?: React.ReactNode;
  testId?: string;
  className?: string;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mql.matches);
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

export default function BottomSheet({
  open,
  onOpenChange,
  title,
  titleHidden = false,
  children,
  peek,
  testId = 'bottom-sheet',
  className,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<DragSample | null>(null);
  const [translateY, setTranslateY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  // Reset any leftover drag offset whenever the sheet (re)opens.
  useEffect(() => {
    if (open) setTranslateY(0);
  }, [open]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragStartRef.current = { y: e.clientY, time: performance.now() };
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (!start) return;
    const current: DragSample = { y: e.clientY, time: performance.now() };
    setTranslateY(dragTranslateY(start, current));
  }, []);

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = dragStartRef.current;
      dragStartRef.current = null;
      setDragging(false);
      if (!start) return;
      const current: DragSample = { y: e.clientY, time: performance.now() };
      const distance = dragTranslateY(start, current);
      const velocity = dragVelocity(start, current);
      const sheetHeight = sheetRef.current?.getBoundingClientRect().height ?? 0;
      if (shouldDismissSheet(distance, velocity, sheetHeight)) {
        onOpenChange(false);
      } else {
        setTranslateY(0);
      }
    },
    [onOpenChange],
  );

  const sheetTransition = dragging || reducedMotion ? undefined : 'transform 200ms ease-out';

  return (
    <>
      {/* Persistent collapsed bar — see the file header's "two shapes". Only
          rendered while a `peek` was given AND the sheet is not (yet) open,
          so a plain modal-only sheet (no `peek`) never mounts anything
          while closed, matching every other Radix-backed dialog in this
          codebase. */}
      {peek && !open && (
        <button
          type="button"
          data-testid={`${testId}-peek`}
          aria-label={title}
          aria-expanded={false}
          onClick={() => onOpenChange(true)}
          className="fixed inset-x-0 bottom-0 z-40 flex w-full items-center justify-center gap-2 border-t border-border bg-card/95 px-4 py-3 text-sm text-foreground shadow-lg backdrop-blur-sm pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
        >
          <span aria-hidden="true" className="h-1 w-10 rounded-full bg-muted-foreground/40" />
          {peek}
        </button>
      )}

      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            data-testid={`${testId}-overlay`}
            className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
          />
          <DialogPrimitive.Content
            ref={sheetRef}
            data-testid={testId}
            onOpenAutoFocus={(e) => {
              // Keep the handle from stealing the initial focus — the first
              // real control inside `children` (or the panel itself) is a
              // better landing spot than a purely decorative drag affordance.
              if (dragStartRef.current) e.preventDefault();
            }}
            className={cn(
              'fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col gap-3 rounded-t-2xl bg-popover p-4 text-popover-foreground shadow-xl outline-none',
              'pb-[calc(1rem+env(safe-area-inset-bottom))]',
              'data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom',
              className,
            )}
            style={{ transform: `translateY(${translateY}px)`, transition: sheetTransition }}
          >
            <div
              data-testid={`${testId}-handle`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              className="-mt-1 flex touch-none justify-center py-2"
            >
              <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-muted-foreground/40" />
            </div>
            <DialogPrimitive.Title className={titleHidden ? 'sr-only' : 'text-base font-medium'}>
              {title}
            </DialogPrimitive.Title>
            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
