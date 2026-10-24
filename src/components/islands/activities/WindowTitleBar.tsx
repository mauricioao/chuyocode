/**
 * WindowTitleBar — a React replica of `DeskWindow.astro`'s own plain-title
 * branch (the practice window's title bar: traffic lights, centred title +
 * level badge), for `ActivityPreviewFrame`'s own design viewport. Same
 * classes/tokens and 3-column grid (`grid-cols-[1fr_auto_1fr]`, `py-2`) as
 * the real title bar, so the preview's own chrome reads exactly like the
 * window the student will actually see it inside.
 *
 * INERT ON PURPOSE: the three traffic lights are plain decorative dots, not
 * links/buttons — there is no real window underneath this preview for a
 * close/minimize/fullscreen click to act on. They still render (rather than
 * being left out) because the real title bar's 3-column grid centres its
 * middle title column by giving both flanking columns an equal `1fr` share
 * — leaving the left column empty while the right one isn't would throw
 * that centring off.
 */
import { DESK_WINDOW_LIGHT_CLASS } from '@/lib/ui/deskWindowLights';
import { ROW_PADDING_X } from '@/lib/ui/layout';
import { cn } from '@/lib/utils';

export interface WindowTitleBarProps {
  title: string;
  /** e.g. "Básico A2" — omitted entirely when the activity has no level, same convention as `DeskWindow.astro`'s own `levelChip`. */
  levelChip?: string | null;
}

export default function WindowTitleBar({ title, levelChip }: WindowTitleBarProps) {
  return (
    <div
      data-testid="window-title-bar"
      className={cn(
        'grid flex-none grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-border bg-chrome',
        ROW_PADDING_X,
        'py-2',
      )}
    >
      <div aria-hidden="true" className="flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center">
          <span className={cn('h-3.5 w-3.5 rounded-full', DESK_WINDOW_LIGHT_CLASS.close)} />
        </span>
        <span className="inline-flex h-7 w-7 items-center justify-center">
          <span className={cn('h-3.5 w-3.5 rounded-full', DESK_WINDOW_LIGHT_CLASS.minimize)} />
        </span>
        <span className="hidden h-7 w-7 items-center justify-center desk:inline-flex">
          <span className={cn('h-3.5 w-3.5 rounded-full', DESK_WINDOW_LIGHT_CLASS.fullscreen)} />
        </span>
      </div>

      <div className="flex min-w-0 items-baseline justify-center gap-2.5">
        <b
          data-testid="window-title-bar-title"
          className="min-w-0 truncate font-display text-[19px] font-extrabold tracking-[-0.02em] text-foreground"
        >
          {title}
        </b>
        {levelChip && (
          <span
            data-testid="window-title-bar-level"
            className="hidden shrink-0 whitespace-nowrap rounded-full bg-[rgb(61_170_107_/_0.14)] px-2.5 py-0.5 text-xs font-semibold text-[#1e6b43] sm:inline-block"
          >
            {levelChip}
          </span>
        )}
      </div>

      <div aria-hidden="true" className="flex flex-none items-center justify-self-end gap-3" />
    </div>
  );
}
