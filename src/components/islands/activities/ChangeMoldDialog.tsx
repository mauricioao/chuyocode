/**
 * ChangeMoldDialog — "Cambiar de molde" (R2, `UX-INGLES.md` §11/§11.1,
 * decision 3 of §8). Opened from a small action beside the mold's own title
 * in every quiz-based editor's {@link SheetHeader} (`QuizBlockEditor.tsx`);
 * never shown for a `worksheet` block, which has no mold to change.
 *
 * Lists the same 5 molds `BlockTypePicker.tsx`'s own start gallery offers,
 * with the SAME title/one-line description (`UI_LABELS[lang].activities.start`)
 * — "a mold's name means the same thing everywhere" (rule 6, §6.1). The
 * block's own current mold is marked "Actual" and never clickable; a mold
 * `templateConversion.ts`'s `conversionOptions` marks unavailable for this
 * block's CURRENT content is disabled, with its reason spelled out in plain
 * language right under its description.
 *
 * Pure presentation: `conversionOptions`/`convertBlock` (the actual data
 * work) are read by the caller — this component only renders the list and
 * reports which mold was chosen, via `onChoose`.
 */
import { ListChecksIcon } from '@phosphor-icons/react/dist/ssr/ListChecks';
import { ArrowsLeftRightIcon } from '@phosphor-icons/react/dist/ssr/ArrowsLeftRight';
import { ArrowsDownUpIcon } from '@phosphor-icons/react/dist/ssr/ArrowsDownUp';
import { BracketsSquareIcon } from '@phosphor-icons/react/dist/ssr/BracketsSquare';
import { SquaresFourIcon } from '@phosphor-icons/react/dist/ssr/SquaresFour';
import { CheckCircleIcon } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import type { Icon } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { UI_LABELS } from '@/lib/i18n';
import type { QuizBlock } from '@/lib/activities/blocks';
import { conversionOptions, type ConversionReason, type Mold } from '@/lib/activities/templateConversion';
import { cn } from '@/lib/utils';

export const COPY = {
  es: {
    title: 'Cambiar de molde',
    current: 'Actual',
    reason: (reason: ConversionReason): string => {
      switch (reason) {
        case 'needs_sentences':
          return 'Este molde necesita oraciones';
        case 'needs_repeated_answers':
          return 'Necesita al menos dos respuestas repetidas para formar grupos';
        case 'not_supported':
          return 'Este molde no está disponible para este contenido';
      }
    },
  },
  en: {
    title: 'Change mold',
    current: 'Current',
    reason: (reason: ConversionReason): string => {
      switch (reason) {
        case 'needs_sentences':
          return 'This mold needs sentences';
        case 'needs_repeated_answers':
          return 'Needs at least two repeated answers to form groups';
        case 'not_supported':
          return 'This mold is not available for this content';
      }
    },
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

function copyFor(lang: string): Copy {
  return lang === 'en' ? COPY.en : COPY.es;
}

function startLabelsFor(lang: string) {
  return UI_LABELS[lang === 'en' ? 'en' : 'es'].activities.start;
}

const MOLD_ICON: Record<string, Icon> = {
  basic: ListChecksIcon,
  match: ArrowsLeftRightIcon,
  reorder: ArrowsDownUpIcon,
  cloze: BracketsSquareIcon,
  groupsort: SquaresFourIcon,
};

/** This dialog's own internal/testid key for a mold — `undefined` ("Varios juegos") reads as `'basic'`. */
function moldKey(template: Mold): string {
  return template ?? 'basic';
}

/** `UI_LABELS[lang].activities.start`'s own key for a mold — `undefined` lives there as `'questions'`. */
function startKey(template: Mold): string {
  return template ?? 'questions';
}

function moldMeta(template: Mold, start: ReturnType<typeof startLabelsFor>): { title: string; description: string; Icon: Icon } {
  const entry = start[startKey(template) as keyof typeof start];
  const { title, description } = entry as { title: string; description: string };
  return { title, description, Icon: MOLD_ICON[moldKey(template)]! };
}

export interface ChangeMoldDialogProps {
  lang: string;
  open: boolean;
  block: QuizBlock;
  onOpenChange: (open: boolean) => void;
  onChoose: (template: Mold) => void;
}

export default function ChangeMoldDialog({ lang, open, block, onOpenChange, onChoose }: ChangeMoldDialogProps) {
  const t = copyFor(lang);
  const start = startLabelsFor(lang);
  const options = conversionOptions(block);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={`change-mold-dialog-${block.id}`} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
        </DialogHeader>
        <ul data-testid={`change-mold-list-${block.id}`} className="flex flex-col gap-1">
          {options.map((option) => {
            const meta = moldMeta(option.template, start);
            const key = moldKey(option.template);
            const clickable = option.available && !option.current;
            return (
              <li key={key}>
                <button
                  type="button"
                  data-testid={`change-mold-option-${block.id}-${key}`}
                  disabled={!clickable}
                  aria-disabled={!clickable}
                  onClick={() => {
                    if (clickable) onChoose(option.template);
                  }}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left',
                    clickable ? 'hover:bg-muted' : 'cursor-default opacity-60',
                  )}
                >
                  <meta.Icon aria-hidden="true" size={20} className="shrink-0 text-accent-ink" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">{meta.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {option.current ? t.current : option.available ? meta.description : t.reason(option.reason!)}
                    </span>
                  </span>
                  {option.current && (
                    <CheckCircleIcon aria-hidden="true" weight="fill" className="shrink-0 text-accent-ink" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
