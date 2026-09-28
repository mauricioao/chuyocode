/**
 * WorksheetPracticePlayer — the learner's real, gradable worksheet view
 * (`/[lang]/ingles/actividades/[id]`, PR D "Activities practice"). Wraps
 * `WorksheetPlayer` in its `practice` mode (see that component's own header)
 * with the one thing it does not own: ZOOM, reused from the creator's own
 * canvas math (`src/lib/activities/canvasViewport.ts` — `clampZoom`,
 * `stepZoom`, `MIN_ZOOM`/`MAX_ZOOM`) rather than a re-derived clamp.
 *
 * TWO ZOOM MODELS, split at `lg` (mobile layout pass): below `lg`, this
 * mounts `WorksheetPracticePlayerMobile` instead — a bounded, pinch/pan
 * CAMERA viewport with a tap-to-open per-zone bottom sheet (see that file's
 * own header for why a phone needs a completely different interaction
 * model, not just different CSS). `useIsDesktop()` picks ONE of the two in
 * JS (never a CSS-only `hidden lg:block` toggle) so only one ever mounts —
 * two copies would double every input's id/state. At `lg` and up, the
 * ORIGINAL desktop model below is completely unchanged: a worksheet fills
 * its wrapper's width at `zoom = 1` ("Ajustar"/Fit — the wrapper is already
 * 100% of the available width by construction, so "fit" is just the reset
 * value); `zoom` beyond `1` scales that width past 100% inside a
 * horizontally scrollable strip, and below `1` shrinks it. No
 * `ResizeObserver`/pointer math is needed the way the creator's pannable
 * canvas needs it — this is one image at a time, read top to bottom.
 */
import { useState } from 'react';
import { MinusIcon } from '@phosphor-icons/react/dist/ssr/Minus';
import { PlusIcon } from '@phosphor-icons/react/dist/ssr/Plus';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import type { WorksheetBlock } from '@/lib/activities/blocks';
import { clampZoom, stepZoom } from '@/lib/activities/canvasViewport';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useHydrated } from '@/hooks/useHydrated';
import { Button } from '@/components/ui/button';
import WorksheetPlayer, { type WorksheetPracticeState } from './WorksheetPlayer';
import WorksheetPracticePlayerMobile from './WorksheetPracticePlayerMobile';

/** The reset value for "Ajustar"/Fit — see file header for why 1 already means "fits the wrapper". */
const FIT_ZOOM = 1;

export interface WorksheetPracticePlayerProps {
  lang: Lang;
  block: WorksheetBlock;
  imageUrl: string;
  practice: WorksheetPracticeState;
}

export default function WorksheetPracticePlayer({ lang, block, imageUrl, practice }: WorksheetPracticePlayerProps) {
  // Reuses the creator's own zoom copy (`activities.worksheet.zoom*`) —
  // same words, same control, no reason to duplicate the strings.
  const t = UI_LABELS[lang].activities.worksheet;
  const [zoom, setZoom] = useState(FIT_ZOOM);
  const isDesktop = useIsDesktop();
  const hydrated = useHydrated();

  const desktopView = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-end gap-1" role="group" aria-label={t.zoomLevel}>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={t.zoomOut}
          data-testid="practice-zoom-out"
          onClick={() => setZoom((z) => stepZoom(z, 'out'))}
        >
          <MinusIcon aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={t.zoomFit}
          data-testid="practice-zoom-fit"
          onClick={() => setZoom(FIT_ZOOM)}
        >
          {t.zoomFit}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={t.zoomIn}
          data-testid="practice-zoom-in"
          onClick={() => setZoom((z) => stepZoom(z, 'in'))}
        >
          <PlusIcon aria-hidden="true" />
        </Button>
      </div>
      <div className="overflow-x-auto">
        <div data-testid="practice-zoom-content" style={{ width: `${clampZoom(zoom) * 100}%` }}>
          <WorksheetPlayer
            lang={lang}
            image={block.image}
            zones={block.zones}
            rotation={block.rotation}
            imageUrl={imageUrl}
            practice={practice}
          />
        </div>
      </div>
    </div>
  );

  const mobileView = (
    <WorksheetPracticePlayerMobile lang={lang} block={block} imageUrl={imageUrl} practice={practice} />
  );

  // No-flash split (mobile layout pass, priority fix): the desktop
  // toolbar+horizontal-scroll model and the mobile pinch/pan camera are two
  // genuinely different subtrees (different gesture model entirely — see
  // this file's own header and `WorksheetPracticePlayerMobile.tsx`'s), not a
  // CSS-only toggle away from each other. `isDesktop` alone defaults to
  // `true` before hydration, so it used to render the desktop toolbar's
  // structure on a phone's very first paint. `!hydrated` (server render +
  // the very first client paint) instead renders BOTH, gated purely by CSS
  // `lg:` classes (real media queries, correct on every viewport
  // immediately, no JS needed) — see `useHydrated`'s own header. The mobile
  // view is additionally `inert` there: a STATIC (not `isDesktop`-driven)
  // choice matching `useIsDesktop`'s own desktop-first SSR default, so the
  // attribute itself never disagrees between the server and the first
  // client render either. Once `hydrated` is true (flushed synchronously by
  // Testing Library's own `render()` — every existing test keeps finding
  // exactly one `WorksheetPlayer`/zoom toolbar), this collapses to mounting
  // only the one `isDesktop` says matches, same as before.
  if (hydrated) return isDesktop ? desktopView : mobileView;
  return (
    <>
      <div className="hidden lg:contents">{desktopView}</div>
      <div className="contents lg:hidden" inert>
        {mobileView}
      </div>
    </>
  );
}
