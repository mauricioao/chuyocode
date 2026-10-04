/**
 * BlockTypePicker — the two-card "what do you want to start with?" chooser
 * (PR B, "Activities creator"; both cards selectable as of PR C, "Preguntas
 * (quiz) block"). Shared by the start screen (`/[lang]/crear`) and the
 * editor's own "+ Agregar bloque" inline picker: choosing a card is the same
 * decision in both places, so it is one component rather than two
 * near-identical ones.
 *
 * Busy state (navigation-without-flicker PR, "create start screen" bullet):
 * `busyCard` names the card currently creating the activity — that card
 * swaps its icon for a spinning `CircleNotch` and gets `aria-busy`, the
 * OTHER card dims (and both become non-interactive) rather than the whole
 * picker just going generically `disabled`. There is no separate "Creando
 * la actividad…" text anymore; the spinner IS the busy indicator.
 *
 * EACH CARD'S TINY ANIMATED PREVIEW (owner build item 7, "Preguntas editor
 * redesign"): a few decorative bars/dots hinting at the actual result —
 * marks on a worksheet, a checked multiple-choice option — PURE CSS
 * (Tailwind's `motion-safe:`/`motion-reduce:` variants, same convention
 * `QuizWheel.tsx`/`SpeakButton.tsx` already use), so "reduced motion ->
 * static" needs no JS at all: the animation simply never applies under
 * `prefers-reduced-motion: reduce`, with zero risk of a server/client
 * mismatch (there is nothing here for React to hydrate differently).
 */
import { FileTextIcon } from '@phosphor-icons/react/dist/ssr/FileText';
import { ListChecksIcon } from '@phosphor-icons/react/dist/ssr/ListChecks';
import { CircleNotchIcon } from '@phosphor-icons/react/dist/ssr/CircleNotch';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type BlockTypeCard = 'worksheet' | 'questions';

export interface BlockTypePickerProps {
  lang: Lang;
  onSelectWorksheet: () => void;
  onSelectQuestions: () => void;
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

export default function BlockTypePicker({
  lang,
  onSelectWorksheet,
  onSelectQuestions,
  busyCard = null,
}: BlockTypePickerProps) {
  const t = UI_LABELS[lang].activities.start;
  const disabled = busyCard !== null;

  return (
    <div
      role="group"
      aria-label={t.heading}
      data-testid="block-type-picker"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      <button
        type="button"
        data-testid="picker-worksheet"
        onClick={onSelectWorksheet}
        disabled={disabled}
        aria-busy={busyCard === 'worksheet'}
        className={cn(
          'text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-xl disabled:cursor-default',
          disabled && busyCard !== 'worksheet' && 'opacity-50',
        )}
      >
        <Card className="h-full ring-1 ring-border transition-theme duration-theme hover:ring-primary">
          <CardHeader>
            <CardIcon busy={busyCard === 'worksheet'} Icon={FileTextIcon} />
            <CardTitle className="text-lg">{t.worksheet.title}</CardTitle>
            <CardDescription>{t.worksheet.description}</CardDescription>
            <WorksheetCardPreview />
          </CardHeader>
        </Card>
      </button>

      <button
        type="button"
        data-testid="picker-questions"
        onClick={onSelectQuestions}
        disabled={disabled}
        aria-busy={busyCard === 'questions'}
        className={cn(
          'text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-xl disabled:cursor-default',
          disabled && busyCard !== 'questions' && 'opacity-50',
        )}
      >
        <Card className="h-full ring-1 ring-border transition-theme duration-theme hover:ring-primary">
          <CardHeader>
            <CardIcon busy={busyCard === 'questions'} Icon={ListChecksIcon} />
            <CardTitle className="text-lg">{t.questions.title}</CardTitle>
            <CardDescription>{t.questions.description}</CardDescription>
            <QuestionsCardPreview />
          </CardHeader>
        </Card>
      </button>
    </div>
  );
}
