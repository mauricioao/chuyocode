/**
 * ActivityStage — the one shared "activity frame" ancestor that makes the
 * floating Comprobar bar (`FLOATING_CHECK_BAR_CLASS`, `scale.ts`) and any
 * other `position: fixed`/`absolute` control inside an activity resolve
 * against THIS box's own edges, never the viewport underneath it — owner
 * audit (`PROPUESTA-PLANTILLAS-2026-10-23.md` §c, LANZAMIENTO H13 part 2):
 * the floating Comprobar used to sit at the PAGE's own bottom-right corner
 * in the course-lesson frame and in the template editor's own live
 * preview, nowhere near the actual activity card.
 *
 * `contain: layout` (NOT `paint`/`strict`/`content`): the CSS Containment
 * spec makes a `contain: layout` box the containing block for every
 * absolutely/fixed positioned descendant regardless of its own `position`
 * value — exactly what the floating Comprobar needs — WITHOUT also
 * clipping paint, which `paint`/`strict` would. `GameResult`'s own Vanina
 * figure and confetti burst deliberately bleed past their stage's edge
 * (`GameResult.tsx`'s own header: "-mb-3 bleeds the root past the ONE
 * stage wrapper"), and `paint` containment would cut that off.
 *
 * `backdrop` is a plain slot, not a prop this component interprets itself —
 * it renders whatever the caller passes, absolutely filling this box
 * BEHIND `children`. Nothing plugs in here yet (writer S2's background
 * image/preset lands later); the plain `bg-background` canvas below is
 * exactly today's desk canvas (`#EEEFF4` on `[data-theme='ingles']`,
 * `global.css`'s own `--background`), unchanged while no backdrop is
 * supplied.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { BlockBackground } from '@/lib/activities/blocks';
import { backdropCssVar } from '@/lib/activities/backgrounds';
import { imagePreviewUrl } from '@/lib/activities/paths';

export interface ActivityStageProps {
  /** Renders behind `children`, absolutely filling this box. Takes priority over `background` when both are supplied (neither caller passes both today). */
  backdrop?: ReactNode;
  /**
   * A molded quiz block's own decorative background (writer S2's data
   * model, `blocks.ts`'s own `BlockBackground`) — painted full-bleed behind
   * `children`. `undefined` keeps the plain grey canvas below
   * (`bg-background`, today's desk canvas, `#EEEFF4` on `[data-theme=
   * 'ingles']`) unchanged.
   */
  background?: BlockBackground;
  className?: string;
  children: ReactNode;
}

/**
 * `background`'s own paint layer — a preset's CSS gradient var, or an
 * uploaded photo (`cover`/`center`) plus the shared `--backdrop-veil` scrim
 * so the white sheet still reads clearly over a busy photo (`blocks.ts`'s
 * own `BlockBackground` header). Exported so `ActivityPracticeIsland`'s own
 * "modo enfoque" view (a separate fixed overlay, not an `ActivityStage`) can
 * paint the SAME layer without duplicating this logic.
 */
export function ActivityBackdropLayer({ background }: { background: BlockBackground }) {
  if (background.kind === 'preset') {
    return (
      <div
        aria-hidden="true"
        data-testid="activity-stage-backdrop-preset"
        className="absolute inset-0"
        style={{ background: backdropCssVar(background.preset) }}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      data-testid="activity-stage-backdrop-image"
      className="absolute inset-0 bg-cover bg-center"
      style={{ backgroundImage: `url(${imagePreviewUrl(background.path)})` }}
    >
      <div data-testid="activity-stage-backdrop-veil" className="absolute inset-0" style={{ background: 'var(--backdrop-veil)' }} />
    </div>
  );
}

export default function ActivityStage({ backdrop, background, className, children }: ActivityStageProps) {
  return (
    <div
      data-testid="activity-stage"
      className={cn('relative flex min-h-0 flex-1 flex-col bg-background [contain:layout]', className)}
    >
      {(backdrop || background) && (
        <div aria-hidden="true" className="absolute inset-0 -z-10">
          {backdrop ?? (background && <ActivityBackdropLayer background={background} />)}
        </div>
      )}
      {children}
    </div>
  );
}
