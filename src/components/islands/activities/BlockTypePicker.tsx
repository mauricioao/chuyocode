/**
 * BlockTypePicker — the two-card "what do you want to start with?" chooser
 * (PR B, "Activities creator"; both cards selectable as of PR C, "Preguntas
 * (quiz) block"). Shared by the start screen (`/[lang]/crear`) and the
 * editor's own "+ Agregar bloque" inline picker: choosing a card is the same
 * decision in both places, so it is one component rather than two
 * near-identical ones.
 */
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export interface BlockTypePickerProps {
  lang: Lang;
  onSelectWorksheet: () => void;
  onSelectQuestions: () => void;
  /** Disables the whole picker (e.g. while a create/upload request is in flight). */
  disabled?: boolean;
}

export default function BlockTypePicker({
  lang,
  onSelectWorksheet,
  onSelectQuestions,
  disabled = false,
}: BlockTypePickerProps) {
  const t = UI_LABELS[lang].activities.start;

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

      <button
        type="button"
        data-testid="picker-questions"
        onClick={onSelectQuestions}
        disabled={disabled}
        className="text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-xl disabled:cursor-default disabled:opacity-50"
      >
        <Card className="h-full ring-1 ring-border transition-theme duration-theme hover:ring-primary">
          <CardHeader>
            <CardTitle className="text-lg">{t.questions.title}</CardTitle>
            <CardDescription>{t.questions.description}</CardDescription>
          </CardHeader>
        </Card>
      </button>
    </div>
  );
}
