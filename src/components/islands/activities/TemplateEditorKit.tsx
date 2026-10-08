/**
 * TemplateEditorKit — the shared pieces every template editor
 * (`MatchPairsEditor`, `ReorderEditor`, `ClozeEditor`, `GroupSortEditor`) is
 * built from, so the four stay visually identical and native to the desk
 * (owner report: "no va a juego con los sombreados y estilos de nuestro
 * escritorio").
 *
 * - {@link TemplateEditorLayout}: the work area — the authoring sheet (desk
 *   glass, left) beside the live preview's stage card (right); stacked on
 *   phones.
 * - {@link SheetHeader}: the sheet's icon chip, template name and one line of
 *   instruction.
 * - {@link TemplateGroup} + {@link TemplateRow} + {@link TemplateField}: an
 *   iOS "grouped list" — one white container, hairline rows, borderless
 *   fields. {@link AddRow} is the group's own last row.
 * - {@link RowRemoveButton}: the round "×" that shows on row hover/focus.
 * - {@link StatusNote} / {@link Footnote}: the small lines under a group.
 * - {@link Chip} + {@link ChipInput}: removable word chips and the inline
 *   "+ word" input that adds them (Enter, blur, or a comma-separated paste).
 * - {@link MiniChip}: the tiny chips of a row's live mini-preview.
 * - {@link useExitingItems}: defers a removal ~160ms so its row/card can fold
 *   away first (immediate under `prefers-reduced-motion` or without
 *   `matchMedia`).
 *
 * Look-and-feel lives in `global.css`'s "Template editor" section (sibling
 * hairlines, focus tints, squircle corners, keyframes); this file only wires
 * structure, semantics and behaviour.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { PlusIcon } from '@phosphor-icons/react/dist/ssr/Plus';
import { XIcon } from '@phosphor-icons/react/dist/ssr/X';
import type { Icon } from '@phosphor-icons/react';
import { useHydrated } from '@/hooks/useHydrated';
import { REDUCED_MOTION_QUERY } from '@/hooks/usePrefersReducedMotion';
import { cn } from '@/lib/utils';

/** How long a removed row/card takes to fold away — matches `global.css`'s `template-row-out`. */
export const ITEM_EXIT_MS = 160;

/**
 * Whether items mounting NOW should play their entry animation. `false`
 * through the server render and hydration (what is already on screen must
 * not animate in on page load), `true` afterwards — so only rows/chips the
 * author actually adds animate. Read once, at each item's own mount.
 */
const AnimateNewItemsContext = createContext(false);

function useEntryAnimation(): boolean {
  const animateNewItems = useContext(AnimateNewItemsContext);
  const [animate] = useState(animateNewItems);
  return animate;
}

function motionAllowed(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return !window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export interface TemplateEditorLayoutProps {
  blockId: string;
  /** The authoring sheet's content (a template editor). */
  sheet: ReactNode;
  /** The live preview — `null` while there is nothing to play yet. */
  preview: ReactNode | null;
  /** The stage's own small label, e.g. "Vista previa". */
  stageLabel: string;
  /** Shown in the stage while `preview` is `null`. */
  stageEmptyText: string;
  onKeyDownCapture?: React.KeyboardEventHandler<HTMLDivElement>;
}

/**
 * The template editor's work area. `data-template-canvas` is what turns the
 * window body behind it into the dotted canvas, edge to edge (`global.css`).
 * Desktop: the sheet keeps ~44% of the width (360–520px) and scrolls on its
 * own; `lg:pr-[70px]` keeps the stage 16px clear of the side toolbar's
 * docked rail (12px from the window edge, 42px wide — `global.css` places
 * the floating Comprobar from the same number); the sheet's last 56px are a
 * footer zone its content scrolls above, where the floating status pill
 * (`ActivityEditorIsland`'s own) sits.
 */
export function TemplateEditorLayout({
  blockId,
  sheet,
  preview,
  stageLabel,
  stageEmptyText,
  onKeyDownCapture,
}: TemplateEditorLayoutProps) {
  const hydrated = useHydrated();
  return (
    <AnimateNewItemsContext.Provider value={hydrated}>
      <div
        data-testid={`quiz-editor-${blockId}`}
        data-template-canvas=""
        onKeyDownCapture={onKeyDownCapture}
        className="flex min-h-0 flex-1 flex-col gap-4 p-4 lg:flex-row lg:pr-[70px]"
      >
        <div
          data-testid={`template-sheet-${blockId}`}
          className="ingles-glass template-sheet flex flex-col lg:min-h-0 lg:w-[clamp(360px,44%,520px)] lg:shrink-0 lg:overflow-clip"
        >
          <div className="template-scroll p-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">{sheet}</div>
          {/* The floating status pill's own footer zone — content scrolls above it, never under it. */}
          <div aria-hidden="true" className="hidden h-14 shrink-0 lg:block" />
        </div>
        <section
          aria-label={stageLabel}
          data-testid={`template-stage-${blockId}`}
          className="template-stage flex min-h-[24rem] min-w-0 flex-col overflow-clip lg:min-h-0 lg:flex-1"
        >
          <p aria-hidden="true" className="px-5 pt-4 text-xs font-medium text-muted-foreground">
            {stageLabel}
          </p>
          <div className="template-scroll flex min-h-0 flex-1 flex-col px-5 pb-5 pt-3 lg:overflow-y-auto">
            {preview ?? (
              <p
                data-testid={`template-stage-empty-${blockId}`}
                className="m-auto max-w-[16rem] text-center text-sm text-muted-foreground"
              >
                {stageEmptyText}
              </p>
            )}
          </div>
        </section>
      </div>
    </AnimateNewItemsContext.Provider>
  );
}

export type SheetTone = 'sky' | 'violet' | 'yellow' | 'green';

const ICON_CHIP_TONE: Record<SheetTone, string> = {
  sky: 'bg-pop-sky text-white',
  violet: 'bg-pop-violet text-white',
  // White on yellow is unreadable; the same dark ink "Enviar a revisión" uses.
  yellow: 'bg-pop-yellow text-[#3a2e00]',
  green: 'bg-pop-green text-white',
};

export function SheetHeader({
  icon: IconComponent,
  tone,
  title,
  instruction,
}: {
  icon: Icon;
  tone: SheetTone;
  title: string;
  instruction: string;
}) {
  return (
    <header className="flex items-center gap-3 pb-5">
      <span
        aria-hidden="true"
        className={cn('template-icon grid size-9 shrink-0 place-items-center', ICON_CHIP_TONE[tone])}
      >
        <IconComponent size={20} weight="bold" />
      </span>
      <div className="min-w-0">
        <h2 className="text-[17px] font-semibold leading-[22px] tracking-[-0.01em] text-foreground">{title}</h2>
        <p className="text-[13px] leading-[18px] text-muted-foreground">{instruction}</p>
      </div>
    </header>
  );
}

/** The small sentence-case label above a group (or a column of one). */
export function GroupLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('px-4 pb-1.5 text-[13px] font-medium text-muted-foreground', className)}>{children}</p>;
}

/** One white grouped-list container. `role="group"` + a name so its rows read as one set. */
export function TemplateGroup({
  ariaLabel,
  testId,
  className,
  children,
}: {
  ariaLabel: string;
  testId?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="group" aria-label={ariaLabel} data-testid={testId} className={cn('template-group overflow-clip', className)}>
      {children}
    </div>
  );
}

/**
 * Folds its content's height away while `leaving` (the grid-track trick in
 * `global.css`), and fades/slides in when it mounts after hydration.
 * `data-removable` marks it for {@link RowRemoveButton}'s keyboard focus
 * hand-off.
 */
export function TemplateCollapse({
  leaving = false,
  className,
  testId,
  children,
}: {
  leaving?: boolean;
  className?: string;
  testId?: string;
  children: ReactNode;
}) {
  const animate = useEntryAnimation();
  return (
    <div
      data-removable=""
      data-testid={testId}
      data-leaving={leaving ? '' : undefined}
      aria-hidden={leaving || undefined}
      className={cn('template-collapse', animate && 'template-enter', className)}
    >
      <div>{children}</div>
    </div>
  );
}

/** One grouped-list row: a hairline above it (but the first), a soft tint while it holds focus. */
export function TemplateRow({
  leaving,
  testId,
  className,
  children,
}: {
  leaving?: boolean;
  testId?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <TemplateCollapse leaving={leaving} testId={testId} className="template-row">
      <div className={className}>{children}</div>
    </TemplateCollapse>
  );
}

/** A borderless grouped-list field (17px, muted placeholder, sky ring on focus). Every caller passes its own `aria-label`. */
export function TemplateField({ className, ...props }: React.ComponentProps<'input'>) {
  return <input type="text" {...props} className={cn('template-field', className)} />;
}

/** Where focus should land after the item holding `button` is removed by keyboard: the next item's first control, else the previous one's. */
function focusTargetAfterRemoving(button: HTMLElement): HTMLElement | null {
  const item = button.closest<HTMLElement>('[data-removable]');
  const sibling = item?.nextElementSibling ?? item?.previousElementSibling;
  if (!(sibling instanceof HTMLElement)) return null;
  if (sibling.matches('input, button')) return sibling;
  return sibling.querySelector<HTMLElement>('input, button');
}

/** The round 24px ghost "×" at a row's far right — hidden until hover/focus where hover exists (`global.css`). */
export function RowRemoveButton({ label, testId, onRemove }: { label: string; testId?: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-testid={testId}
      onClick={(event) => {
        // `detail === 0`: activated from the keyboard, not a pointer — hand
        // focus to the neighbouring row instead of dropping it on <body>.
        const next = event.detail === 0 ? focusTargetAfterRemoving(event.currentTarget) : null;
        onRemove();
        next?.focus();
      }}
      className="template-row-action grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.07] hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pop-sky-deep pointer-coarse:size-10"
    >
      <XIcon aria-hidden="true" size={12} weight="bold" />
    </button>
  );
}

/** A pop-sky "+" in a 20px circle — the add affordance's own mark. */
function PlusMark() {
  return (
    <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full bg-pop-sky text-white">
      <PlusIcon size={12} weight="bold" />
    </span>
  );
}

/** The group's own last row: "+ Agregar …", the whole row clickable. */
export function AddRow({ label, testId, onClick }: { label: string; testId?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="template-row flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[17px] text-accent-ink hover:bg-foreground/[0.03] active:bg-foreground/[0.06] focus-visible:shadow-[inset_0_0_0_2px_var(--color-pop-sky-deep)] focus-visible:outline-none"
    >
      <PlusMark />
      {label}
    </button>
  );
}

/** A dashed ghost card that adds a whole new group (`GroupSortEditor`). */
export function AddCard({ label, testId, onClick }: { label: string; testId?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="template-ghost flex min-h-[52px] w-full items-center gap-3 border border-dashed border-foreground/20 px-4 text-left text-[17px] text-accent-ink hover:bg-card/60 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pop-sky-deep"
    >
      <PlusMark />
      {label}
    </button>
  );
}

export type StatusTone = 'warn' | 'ready';

/**
 * The status footnote under a group: a dot plus one line — amber while the
 * content is not playable yet, green once it is. `role="status"` so the
 * switch to "Listo para jugar" is announced; callers render it in the same
 * spot either way, so the live region stays mounted while its text changes.
 */
export function StatusNote({ tone, testId, children }: { tone: StatusTone; testId?: string; children: ReactNode }) {
  return (
    <p
      role="status"
      data-testid={testId}
      data-tone={tone}
      className="flex items-center gap-2 px-4 pt-2 text-[13px] leading-[18px]"
    >
      <span
        aria-hidden="true"
        className={cn('size-1.5 shrink-0 rounded-full', tone === 'ready' ? 'bg-pop-green' : 'bg-pop-yellow')}
      />
      <span className={tone === 'ready' ? 'text-success' : 'text-hint'}>{children}</span>
    </p>
  );
}

/** A plain muted footnote under a group (hints, examples). */
export function Footnote({ testId, children }: { testId?: string; children: ReactNode }) {
  return (
    <p data-testid={testId} className="px-4 pt-2 text-[13px] leading-[18px] text-muted-foreground">
      {children}
    </p>
  );
}

/** A white, hairlined, removable word chip. Its remove button is the chip's only button. */
export function Chip({
  testId,
  removeLabel,
  removeTestId,
  onRemove,
  children,
}: {
  testId?: string;
  removeLabel: string;
  removeTestId?: string;
  onRemove: () => void;
  children: ReactNode;
}) {
  const animate = useEntryAnimation();
  return (
    <span
      data-testid={testId}
      className={cn(
        'template-chip inline-flex h-8 max-w-full items-center gap-0.5 rounded-[9px] bg-card pl-3 pr-1 text-[15px] text-foreground pointer-coarse:h-10',
        animate && 'template-chip-enter',
      )}
    >
      <span className="truncate">{children}</span>
      <button
        type="button"
        aria-label={removeLabel}
        data-testid={removeTestId}
        onClick={onRemove}
        className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.07] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pop-sky-deep pointer-coarse:size-8"
      >
        <XIcon aria-hidden="true" size={11} weight="bold" />
      </button>
    </span>
  );
}

/**
 * The inline "+ word" chip input. Owns only its in-progress text (never part
 * of the authored draft); Enter or leaving the field hands it to `onCommit`
 * (a comma-separated paste arrives as one string — the caller splits it)
 * and clears it.
 */
export function ChipInput({
  placeholder,
  ariaLabel,
  testId,
  onCommit,
}: {
  placeholder: string;
  ariaLabel: string;
  testId?: string;
  onCommit: (text: string) => void;
}) {
  const [draft, setDraft] = useState('');

  function commit() {
    if (draft.trim() === '') return;
    onCommit(draft);
    setDraft('');
  }

  return (
    <input
      type="text"
      aria-label={ariaLabel}
      placeholder={placeholder}
      data-testid={testId}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || event.ctrlKey || event.metaKey) return;
        event.preventDefault();
        commit();
      }}
      onBlur={commit}
      className="template-chip-input h-8 min-w-[7.5rem] max-w-full rounded-[9px] px-3 text-[15px] pointer-coarse:h-10"
    />
  );
}

/** A tiny chip in a row's live mini-preview — neutral (a word) or yellow (a cloze blank). */
export function MiniChip({ tone = 'neutral', children }: { tone?: 'neutral' | 'yellow'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-[7px] px-2 text-[12px] font-medium leading-none text-foreground',
        tone === 'yellow' ? 'bg-pop-yellow/30' : 'bg-foreground/[0.06]',
      )}
    >
      {children}
    </span>
  );
}

/**
 * Removal with an exit animation: `remove(key, ...args)` marks `key` as
 * leaving (its {@link TemplateCollapse} folds away) and calls `onRemove(...
 * args)` {@link ITEM_EXIT_MS} later — or immediately when motion is reduced
 * or `matchMedia` is unavailable. `onRemove` is read at call time, never
 * from the click's own render, so the commit always applies to the latest
 * draft. Pending removals still commit if the editor unmounts first.
 */
export function useExitingItems<A extends unknown[]>(onRemove: (...args: A) => void) {
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(() => new Set());
  const latest = useRef(onRemove);
  const pending = useRef(new Map<string, { timer: number; args: A }>());

  useEffect(() => {
    latest.current = onRemove;
  });

  useEffect(() => {
    const timers = pending.current;
    return () => {
      for (const { timer, args } of timers.values()) {
        window.clearTimeout(timer);
        latest.current(...args);
      }
      timers.clear();
    };
  }, []);

  const remove = useCallback((key: string, ...args: A) => {
    if (pending.current.has(key)) return;
    if (!motionAllowed()) {
      latest.current(...args);
      return;
    }
    setLeaving((prev) => new Set(prev).add(key));
    const timer = window.setTimeout(() => {
      pending.current.delete(key);
      latest.current(...args);
      setLeaving((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, ITEM_EXIT_MS);
    pending.current.set(key, { timer, args });
  }, []);

  const isLeaving = useCallback((key: string) => leaving.has(key), [leaving]);

  return { isLeaving, remove };
}
