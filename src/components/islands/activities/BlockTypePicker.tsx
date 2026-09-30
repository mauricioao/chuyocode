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
    <div aria-hidden="true" className="flex h-9 w-9 items-center justify-center text-primary">
      {busy ? <CircleNotchIcon size={24} className="animate-spin" /> : <Icon size={24} />}
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
          </CardHeader>
        </Card>
      </button>
    </div>
  );
}
