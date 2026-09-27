/**
 * BlockTypePicker — the two-card "what do you want to start with?" chooser
 * (PR B, "Activities creator"). Shared by the start screen (`/[lang]/crear`)
 * and the editor's own "+ Agregar bloque" inline picker: choosing a card is
 * the same decision in both places, so it is one component rather than two
 * near-identical ones.
 *
 * ONLY WORKSHEET IS SELECTABLE IN THIS PR. The "Preguntas/Questions" card is
 * rendered but disabled with a "Pronto/Soon" badge — that block type ships
 * in PR C. It is still in the DOM (not hidden) so the picker's shape reads
 * the same before and after that PR lands.
 */
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface BlockTypePickerProps {
  lang: Lang;
  onSelectWorksheet: () => void;
  /** Disables the whole picker (e.g. while a create/upload request is in flight). */
  disabled?: boolean;
}

export default function BlockTypePicker({ lang, onSelectWorksheet, disabled = false }: BlockTypePickerProps) {
  const t = UI_LABELS[lang].activities.start;
  const soon = UI_LABELS[lang].nav.soon;

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
        className="text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-xl disabled:cursor-default disabled:opacity-50"
      >
        <Card className="h-full ring-1 ring-border transition-theme duration-theme hover:ring-primary">
          <CardHeader>
            <CardTitle className="text-lg">{t.worksheet.title}</CardTitle>
            <CardDescription>{t.worksheet.description}</CardDescription>
          </CardHeader>
        </Card>
      </button>

      <div
        data-testid="picker-questions"
        aria-disabled="true"
        className="cursor-default rounded-xl opacity-60"
      >
        <Card className="h-full ring-1 ring-border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">{t.questions.title}</CardTitle>
              <Badge variant="secondary">{soon}</Badge>
            </div>
            <CardDescription>{t.questions.description}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
