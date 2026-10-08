/**
 * BlockTypePicker — the "what do you want to start with?" gallery (PR B,
 * "Activities creator"; all three cards selectable as of the start-gallery
 * redesign, build item 3). Shared by the start screen (`/[lang]/crear`) and
 * the editor's own empty-block-list picker: choosing a card is the same
 * decision in both places, so it is one component rather than several
 * near-identical ones.
 *
 * WORDWALL'S OWN "ELIGE EL PUNTO DE PARTIDA" GRID, in our visual language
 * (owner spec: the iOS/macOS desk, not Wordwall's look) — a card per
 * TEMPLATE that actually has a shipped practice experience ("only show
 * templates that work"; a template plumbed but not built yet, see
 * `blocks.ts`'s `QuizTemplate`, gets no card here until it ships one). Each
 * card names the activity, states in ONE plain line what the student
 * actually does, and carries a tiny illustrative preview — never Wordwall's
 * own art, just its shape. 3 columns in a wide window, 2 in a narrower one,
 * 1 on a phone (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`).
 *
 * Busy state (navigation-without-flicker PR, "create start screen" bullet):
 * `busyCard` names the card currently creating the activity — that card
 * swaps its icon for a spinning `CircleNotch` and gets `aria-busy`, every
 * OTHER card dims (and all become non-interactive) rather than the whole
 * picker just going generically `disabled`. There is no separate "Creando
 * la actividad…" text anymore; the spinner IS the busy indicator.
 *
 * EACH CARD'S TINY ANIMATED PREVIEW (owner build item 7, "Preguntas editor
 * redesign"; extended for "Une las parejas" in the start-gallery redesign):
 * a few decorative bars/dots hinting at the actual result — marks on a
 * worksheet, a checked multiple-choice option, two columns of tiles
 * swapping places — PURE CSS (Tailwind's `motion-safe:`/`motion-reduce:`
 * variants, same convention `QuizWheel.tsx`/`SpeakButton.tsx` already use),
 * so "reduced motion -> static" needs no JS at all: the animation simply
 * never applies under `prefers-reduced-motion: reduce`, with zero risk of a
 * server/client mismatch (there is nothing here for React to hydrate
 * differently). Every preview only animates on the card's own `:hover`
 * (`group-hover:`) — idle cards sit still, same restraint as the rest of
 * this system's "pop accents, delicate shadows" posture.
 */
import { FileTextIcon } from '@phosphor-icons/react/dist/ssr/FileText';
import { ListChecksIcon } from '@phosphor-icons/react/dist/ssr/ListChecks';
import { ArrowsLeftRightIcon } from '@phosphor-icons/react/dist/ssr/ArrowsLeftRight';
import { ArrowsDownUpIcon } from '@phosphor-icons/react/dist/ssr/ArrowsDownUp';
import { BracketsSquareIcon } from '@phosphor-icons/react/dist/ssr/BracketsSquare';
import { SquaresFourIcon } from '@phosphor-icons/react/dist/ssr/SquaresFour';
import { CircleNotchIcon } from '@phosphor-icons/react/dist/ssr/CircleNotch';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { Card, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * The left "illustration" column's own fixed width — every card's icon +
 * tiny preview sits in the SAME width (Wordwall gallery reference: a small
 * illustration left, name + one line right), so the six cards read as one
 * consistent row instead of each sizing itself to its own content.
 */
const ILLUSTRATION_COLUMN = 'w-28 sm:w-32';

export type BlockTypeCard = 'worksheet' | 'questions' | 'match' | 'reorder' | 'cloze' | 'groupsort';

export interface BlockTypePickerProps {
  lang: Lang;
  onSelectWorksheet: () => void;
  onSelectQuestions: () => void;
  onSelectMatch: () => void;
  onSelectReorder: () => void;
  onSelectCloze: () => void;
  onSelectGroupSort: () => void;
  /** The card currently creating the activity, if any — see the file header. `null`/omitted: the picker is fully idle. */
  busyCard?: BlockTypeCard | null;
}

/** One card's icon: its normal icon, or a spinning `CircleNotch` while `busy`. */
function CardIcon({ busy, Icon }: { busy: boolean; Icon: typeof FileTextIcon }) {
  return (
    <div aria-hidden="true" className="flex h-9 w-9 items-center justify-center text-accent-ink">
      {busy ? <CircleNotchIcon size={24} className="animate-spin" /> : <Icon size={24} />}
    </div>
  );
}

/**
 * The worksheet card's tiny result preview: a couple of text lines with one
 * highlighted "answer" mark that softly pulses, hinting at "mark where the
 * answers go" without needing a real image.
 */
function WorksheetCardPreview() {
  return (
    <div
      aria-hidden="true"
      data-testid="card-preview-worksheet"
      className="mt-2 flex h-11 w-full flex-col justify-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5"
    >
      <span className="h-1.5 w-3/4 rounded-full bg-foreground/15" />
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1/3 rounded-full bg-foreground/15" />
        <span className="motion-safe:animate-pulse h-2.5 w-5 rounded-sm border border-primary/50 bg-primary/20" />
      </span>
    </div>
  );
}

/**
 * The questions card's tiny result preview: two option rows, the correct one
 * softly pulsing its checkmark dot — "the learner answers it".
 */
function QuestionsCardPreview() {
  return (
    <div
      aria-hidden="true"
      data-testid="card-preview-questions"
      className="mt-2 flex h-11 w-full flex-col justify-center gap-1 rounded-md border border-border bg-muted/40 px-2.5"
    >
      <span className="flex items-center gap-1.5">
        <span className="motion-safe:animate-pulse size-2 shrink-0 rounded-full bg-primary" />
        <span className="h-1.5 w-2/3 rounded-full bg-foreground/15" />
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2 shrink-0 rounded-full border border-foreground/30" />
        <span className="h-1.5 w-1/2 rounded-full bg-foreground/15" />
      </span>
    </div>
  );
}

/**
 * "Une las parejas" card's tiny result preview: two columns of three small
 * tiles each, the middle pair's connecting line drawing itself in on hover
 * (`group-hover:`) — hinting at "drag an answer onto its partner" without a
 * real drag gesture.
 */
function MatchCardPreview() {
  return (
    <div
      aria-hidden="true"
      data-testid="card-preview-match"
      className="mt-2 flex h-11 w-full items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3"
    >
      <div className="flex flex-col gap-1">
        <span className="h-1.5 w-6 rounded-full bg-foreground/15" />
        <span className="h-1.5 w-6 rounded-full bg-primary/40" />
        <span className="h-1.5 w-6 rounded-full bg-foreground/15" />
      </div>
      <svg aria-hidden="true" viewBox="0 0 24 8" className="h-2 w-6 flex-none overflow-visible">
        <line
          x1="0"
          y1="4"
          x2="24"
          y2="4"
          strokeWidth="2"
          strokeLinecap="round"
          className="motion-safe:group-hover:[stroke-dashoffset:0] stroke-primary/60 [stroke-dasharray:24] [stroke-dashoffset:24] transition-[stroke-dashoffset] duration-500 motion-reduce:[stroke-dashoffset:0]"
        />
      </svg>
      <div className="flex flex-col gap-1">
        <span className="h-1.5 w-6 rounded-full bg-foreground/15" />
        <span className="h-1.5 w-6 rounded-full bg-primary/40" />
        <span className="h-1.5 w-6 rounded-full bg-foreground/15" />
      </div>
    </div>
  );
}

/**
 * "Reordenar" card's tiny result preview: three scrambled word bars that
 * slide into reading order on hover (`group-hover:`) — hinting at "drag the
 * words back into order" without a real drag gesture, same restraint
 * {@link MatchCardPreview}'s own connecting-line animation uses.
 */
function ReorderCardPreview() {
  return (
    <div
      aria-hidden="true"
      data-testid="card-preview-reorder"
      className="mt-2 flex h-11 w-full items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5"
    >
      <span className="h-1.5 w-5 rounded-full bg-primary/40 transition-transform duration-500 motion-safe:group-hover:translate-x-0 motion-safe:translate-x-3" />
      <span className="h-1.5 w-8 rounded-full bg-foreground/15 transition-transform duration-500 motion-safe:group-hover:translate-x-0 motion-safe:-translate-x-1" />
      <span className="h-1.5 w-4 rounded-full bg-foreground/15 transition-transform duration-500 motion-safe:group-hover:translate-x-0 motion-safe:-translate-x-2" />
    </div>
  );
}

/**
 * "Completar la frase" card's tiny result preview: a short line with one
 * blank, a tiny tile sliding in to fill it on hover (`group-hover:`) —
 * hinting at "drag the word into the blank" without a real drag gesture,
 * same restraint `ReorderCardPreview`'s own sliding bars use.
 */
function ClozeCardPreview() {
  return (
    <div
      aria-hidden="true"
      data-testid="card-preview-cloze"
      className="mt-2 flex h-11 w-full items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5"
    >
      <span className="h-1.5 w-5 rounded-full bg-foreground/15" />
      <span className="h-3 w-7 rounded-sm border border-dashed border-primary/50" />
      <span className="h-1.5 w-9 rounded-full bg-foreground/15" />
      <span className="h-3 w-5 rounded-sm bg-primary/40 transition-transform duration-500 motion-safe:group-hover:translate-x-0 motion-safe:-translate-x-1" />
    </div>
  );
}

/**
 * "Ordenar por grupos" card's tiny result preview: two small group boxes,
 * each with a couple of item bars, plus one loose tile sliding into the
 * first box on hover (`group-hover:`) — hinting at "drag each item into its
 * group" without a real drag gesture, same restraint `ClozeCardPreview`'s
 * own sliding tile uses.
 */
function GroupSortCardPreview() {
  return (
    <div
      aria-hidden="true"
      data-testid="card-preview-groupsort"
      className="mt-2 flex h-11 w-full items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5"
    >
      <div className="flex flex-1 flex-col gap-1 rounded-sm border border-dashed border-primary/40 p-1">
        <span className="h-1.5 w-full rounded-full bg-foreground/15" />
        <span className="h-1.5 w-2/3 rounded-full bg-foreground/15" />
      </div>
      <span className="h-3 w-5 shrink-0 rounded-sm bg-primary/40 transition-transform duration-500 motion-safe:group-hover:translate-x-0 motion-safe:-translate-x-2 motion-safe:group-hover:opacity-100 motion-safe:opacity-0" />
      <div className="flex flex-1 flex-col gap-1 rounded-sm border border-dashed border-foreground/20 p-1">
        <span className="h-1.5 w-full rounded-full bg-foreground/15" />
      </div>
    </div>
  );
}

export default function BlockTypePicker({
  lang,
  onSelectWorksheet,
  onSelectQuestions,
  onSelectMatch,
  onSelectReorder,
  onSelectCloze,
  onSelectGroupSort,
  busyCard = null,
}: BlockTypePickerProps) {
  const t = UI_LABELS[lang].activities.start;
  const disabled = busyCard !== null;

  return (
    <div
      role="group"
      aria-label={t.heading}
      data-testid="block-type-picker"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <button
        type="button"
        data-testid="picker-worksheet"
        onClick={onSelectWorksheet}
        disabled={disabled}
        aria-busy={busyCard === 'worksheet'}
        className={cn(
          'group text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-xl disabled:cursor-default',
          disabled && busyCard !== 'worksheet' && 'opacity-50',
        )}
      >
        <Card className="h-full ring-1 ring-border transition-theme duration-theme hover:ring-primary">
          <CardContent className="flex items-center gap-4">
            <div className={cn('flex shrink-0 flex-col items-center gap-1', ILLUSTRATION_COLUMN)}>
              <CardIcon busy={busyCard === 'worksheet'} Icon={FileTextIcon} />
              <WorksheetCardPreview />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base font-semibold">{t.worksheet.title}</CardTitle>
              <CardDescription className="mt-1">{t.worksheet.description}</CardDescription>
            </div>
          </CardContent>
        </Card>
      </button>

      <button
        type="button"
        data-testid="picker-questions"
        onClick={onSelectQuestions}
        disabled={disabled}
        aria-busy={busyCard === 'questions'}
        className={cn(
          'group text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-xl disabled:cursor-default',
          disabled && busyCard !== 'questions' && 'opacity-50',
        )}
      >
        <Card className="h-full ring-1 ring-border transition-theme duration-theme hover:ring-primary">
          <CardContent className="flex items-center gap-4">
            <div className={cn('flex shrink-0 flex-col items-center gap-1', ILLUSTRATION_COLUMN)}>
              <CardIcon busy={busyCard === 'questions'} Icon={ListChecksIcon} />
              <QuestionsCardPreview />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base font-semibold">{t.questions.title}</CardTitle>
              <CardDescription className="mt-1">{t.questions.description}</CardDescription>
            </div>
          </CardContent>
        </Card>
      </button>

      <button
        type="button"
        data-testid="picker-match"
        onClick={onSelectMatch}
        disabled={disabled}
        aria-busy={busyCard === 'match'}
        className={cn(
          'group text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-xl disabled:cursor-default',
          disabled && busyCard !== 'match' && 'opacity-50',
        )}
      >
        <Card className="h-full ring-1 ring-border transition-theme duration-theme hover:ring-primary">
          <CardContent className="flex items-center gap-4">
            <div className={cn('flex shrink-0 flex-col items-center gap-1', ILLUSTRATION_COLUMN)}>
              <CardIcon busy={busyCard === 'match'} Icon={ArrowsLeftRightIcon} />
              <MatchCardPreview />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base font-semibold">{t.match.title}</CardTitle>
              <CardDescription className="mt-1">{t.match.description}</CardDescription>
            </div>
          </CardContent>
        </Card>
      </button>

      <button
        type="button"
        data-testid="picker-reorder"
        onClick={onSelectReorder}
        disabled={disabled}
        aria-busy={busyCard === 'reorder'}
        className={cn(
          'group text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-xl disabled:cursor-default',
          disabled && busyCard !== 'reorder' && 'opacity-50',
        )}
      >
        <Card className="h-full ring-1 ring-border transition-theme duration-theme hover:ring-primary">
          <CardContent className="flex items-center gap-4">
            <div className={cn('flex shrink-0 flex-col items-center gap-1', ILLUSTRATION_COLUMN)}>
              <CardIcon busy={busyCard === 'reorder'} Icon={ArrowsDownUpIcon} />
              <ReorderCardPreview />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base font-semibold">{t.reorder.title}</CardTitle>
              <CardDescription className="mt-1">{t.reorder.description}</CardDescription>
            </div>
          </CardContent>
        </Card>
      </button>

      <button
        type="button"
        data-testid="picker-cloze"
        onClick={onSelectCloze}
        disabled={disabled}
        aria-busy={busyCard === 'cloze'}
        className={cn(
          'group text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-xl disabled:cursor-default',
          disabled && busyCard !== 'cloze' && 'opacity-50',
        )}
      >
        <Card className="h-full ring-1 ring-border transition-theme duration-theme hover:ring-primary">
          <CardContent className="flex items-center gap-4">
            <div className={cn('flex shrink-0 flex-col items-center gap-1', ILLUSTRATION_COLUMN)}>
              <CardIcon busy={busyCard === 'cloze'} Icon={BracketsSquareIcon} />
              <ClozeCardPreview />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base font-semibold">{t.cloze.title}</CardTitle>
              <CardDescription className="mt-1">{t.cloze.description}</CardDescription>
            </div>
          </CardContent>
        </Card>
      </button>

      <button
        type="button"
        data-testid="picker-groupsort"
        onClick={onSelectGroupSort}
        disabled={disabled}
        aria-busy={busyCard === 'groupsort'}
        className={cn(
          'group text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-xl disabled:cursor-default',
          disabled && busyCard !== 'groupsort' && 'opacity-50',
        )}
      >
        <Card className="h-full ring-1 ring-border transition-theme duration-theme hover:ring-primary">
          <CardContent className="flex items-center gap-4">
            <div className={cn('flex shrink-0 flex-col items-center gap-1', ILLUSTRATION_COLUMN)}>
              <CardIcon busy={busyCard === 'groupsort'} Icon={SquaresFourIcon} />
              <GroupSortCardPreview />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base font-semibold">{t.groupsort.title}</CardTitle>
              <CardDescription className="mt-1">{t.groupsort.description}</CardDescription>
            </div>
          </CardContent>
        </Card>
      </button>
    </div>
  );
}
