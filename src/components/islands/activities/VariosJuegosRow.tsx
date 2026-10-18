/**
 * VariosJuegosRow — one "Varios juegos" question as a simple Pregunta |
 * Respuesta row (R3, "the same building experience as the four templates"):
 * by default a plain TEXT question, same shape as a `MatchPairsEditor` pair,
 * with a per-row "Agregar opciones" toggle into multiple choice (and back)
 * driven by the SAME `onTypeChange` callback `QuestionCard` already took —
 * `changeQuestionSegment` (`quizQuestionType.ts`) does the preserving work
 * either way, so toggling never loses the question text or a text answer
 * already typed.
 *
 * PER-ROW ESCAPE ("Editor avanzado"): a `gap` question (select/drop) or a
 * `text` question with more than one accepted answer cannot be shown by this
 * simple row without silently dropping something on the next edit
 * (`quizQuestionType.ts`'s own `needsAdvancedEditor`) — those shapes render
 * the full {@link QuestionCard} automatically instead, so every shape the
 * old editor supported stays fully editable, never lost. The same old card
 * is also reachable VOLUNTARILY for any row (the only way, from this
 * simpler view, to set a question's optional "¿Por qué?" explanation).
 *
 * Props are exactly `QuestionCard`'s own, plus one addition
 * (`onPasteIntoRow`, bulk paste N5): this row only decides WHICH UI renders
 * for a slot, never a second way to mutate it.
 */
import { useRef, useState } from 'react';
import { CheckIcon } from '@phosphor-icons/react/dist/ssr/Check';
import { ImageIcon } from '@phosphor-icons/react/dist/ssr/Image';
import { XIcon } from '@phosphor-icons/react/dist/ssr/X';
import { needsAdvancedEditor, segmentForInput } from '@/lib/quizQuestionType';
import { cn } from '@/lib/utils';
import { CHIP_INLINE } from '@/components/islands/mechanics/chip';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { imagePreviewUrl } from '@/lib/activities/paths';
import { convertImageToWebp } from '@/lib/activities/imagePipeline';
import type { PromptImageRef } from '@/lib/activities/blocks';
import { FadeImage } from '@/components/ui/fade-image';
import QuestionCard, { type QuestionCardProps } from './QuestionCard';
import { RowRemoveButton, TemplateField, TemplateRow } from './TemplateEditorKit';

const COPY = {
  es: {
    questionLabel: 'Pregunta',
    answerLabel: 'Respuesta',
    questionPlaceholder: 'Escribe la pregunta',
    answerPlaceholder: 'Respuesta',
    removeRow: 'Eliminar pregunta',
    addOptions: 'Agregar opciones',
    removeOptions: 'Quitar opciones',
    openAdvanced: 'Editor avanzado',
    closeAdvanced: 'Cerrar editor avanzado',
    addOption: '+ Agregar opción',
    markCorrect: 'Marcar como correcta',
    removeOption: 'Quitar esta opción',
    optionPlaceholder: 'Opción',
  },
  en: {
    questionLabel: 'Question',
    answerLabel: 'Answer',
    questionPlaceholder: 'Write the question',
    answerPlaceholder: 'Answer',
    removeRow: 'Delete question',
    addOptions: 'Add options',
    removeOptions: 'Remove options',
    openAdvanced: 'Advanced editor',
    closeAdvanced: 'Close advanced editor',
    addOption: '+ Add option',
    markCorrect: 'Mark as correct',
    removeOption: 'Remove this option',
    optionPlaceholder: 'Option',
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

function copyFor(lang: string): Copy {
  return lang === 'en' ? COPY.en : COPY.es;
}

export interface VariosJuegosRowProps extends QuestionCardProps {
  /** A paste landed in this row's question or answer field — bulk-paste (N5), handled by the caller just like `MatchPairsEditor`'s own `onPastePairs`. `undefined` while escaped to {@link QuestionCard} (no bulk paste there, same as the old editor). */
  onPasteIntoRow?: (event: React.ClipboardEvent<HTMLInputElement>) => void;
  /**
   * This question's own DISPLAY-ONLY context image (owner decision
   * 2026-10-16) — `undefined` = none, the common case. Never a worksheet
   * image; see `blocks.ts`'s own `PromptImageRef` header.
   */
  promptImage?: PromptImageRef;
  /** The author added/removed/replaced this question's own image — one undo step per call, same posture as every other row mutation. `undefined` while escaped to {@link QuestionCard} (no image affordance there). */
  onPromptImageChange?: (image: PromptImageRef | undefined) => void;
}

/** `?purpose=question`'s own accepted source types — images only, never a PDF (no stitching/rotation for a question's context image, owner spec). */
const ACCEPTED_IMAGE_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp']);

type QuestionImageStatus = { kind: 'idle' } | { kind: 'uploading' } | { kind: 'error'; message: string };

/**
 * Per-question "Agregar imagen" / thumbnail+"Quitar imagen" (owner decision
 * 2026-10-16) — a small, self-contained uploader, deliberately NOT
 * `uploadTask.ts`'s multi-page state machine (`WorksheetUploader.tsx`'s
 * own): there is at most one image, no PDF, no stitching, so a single
 * idle/uploading/error state is the whole story. Reuses
 * `imagePipeline.ts`'s own `convertImageToWebp` (resize + strip EXIF +
 * encode) and the SAME `/api/actividades/imagen` endpoint, with
 * `?purpose=question` so the server stores it under the distinct
 * `question-` prefix (`@lib/activities/paths`'s own "KIND PREFIX" header) —
 * never a worksheet image anywhere downstream.
 */
function QuestionImageField({
  lang,
  slotId,
  image,
  onChange,
}: {
  lang: string;
  slotId: string;
  image: PromptImageRef | undefined;
  onChange: (image: PromptImageRef | undefined) => void;
}) {
  const localeKey: Lang = lang === 'en' ? 'en' : 'es';
  const t = UI_LABELS[localeKey].activities.questionImage;
  const errors = UI_LABELS[localeKey].activities.worksheet.errors as Record<string, string>;
  const [status, setStatus] = useState<QuestionImageStatus>({ kind: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      setStatus({ kind: 'error', message: errors.unsupported_media_type ?? errors.upload_failed });
      return;
    }
    setStatus({ kind: 'uploading' });
    try {
      const blob = await convertImageToWebp(file);
      const res = await fetch('/api/actividades/imagen?purpose=question', {
        method: 'POST',
        headers: { 'content-type': 'image/webp' },
        body: blob,
      });
      const data = (await res.json().catch(() => ({}))) as {
        path?: string;
        width?: number;
        height?: number;
        error?: string;
      };
      if (!res.ok || !data.path || !data.width || !data.height) {
        setStatus({ kind: 'error', message: errors[data.error ?? ''] ?? errors.upload_failed });
        return;
      }
      setStatus({ kind: 'idle' });
      onChange({ path: data.path, width: data.width, height: data.height });
    } catch {
      setStatus({ kind: 'error', message: errors.upload_failed });
    }
  }

  return (
    <div className="flex flex-col gap-1.5" data-testid={`varios-question-image-${slotId}`}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        data-testid={`varios-question-image-input-${slotId}`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void handleFile(file);
        }}
      />
      {image ? (
        <div className="flex items-center gap-2">
          <FadeImage
            src={imagePreviewUrl(image.path)}
            alt=""
            data-testid={`varios-question-image-thumb-${slotId}`}
            className="h-14 w-14 rounded-md border border-border object-cover"
            placeholderClassName="h-14 w-14 rounded-md border border-border"
          />
          <button
            type="button"
            data-testid={`varios-question-image-remove-${slotId}`}
            onClick={() => onChange(undefined)}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-destructive"
          >
            <XIcon aria-hidden="true" size={14} />
            {t.remove}
          </button>
        </div>
      ) : (
        <button
          type="button"
          data-testid={`varios-question-image-add-${slotId}`}
          disabled={status.kind === 'uploading'}
          onClick={() => inputRef.current?.click()}
          className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-accent-ink hover:underline disabled:opacity-50"
        >
          <ImageIcon aria-hidden="true" size={14} />
          {status.kind === 'uploading' ? t.uploading : t.add}
        </button>
      )}
      {status.kind === 'error' && (
        <p data-testid={`varios-question-image-error-${slotId}`} className="text-xs text-destructive">
          {status.message}
        </p>
      )}
    </div>
  );
}

/**
 * Handle | Pregunta | divider | Respuesta-or-opciones | "×" — a named
 * CSS-GRID COLUMN SCHEME (mobile review 2026-10-18, H14 + reviewer
 * follow-up), the same 5 columns at every width so every piece that must
 * share an edge with another (question text / its own image action /
 * the answer-and-links block) does so by occupying the SAME grid column,
 * never by hand-matched padding:
 *
 *   col 1 `auto`            — the drag handle (own column at every width,
 *                              never nested inside the question field's own
 *                              box — see that reasoning below).
 *   col 2 `minmax(0,1fr)`   — the question field AND, directly below it in
 *                              row 2, its own "Agregar/Quitar imagen" — both
 *                              in this one column, so they share one edge.
 *   col 3 `1px`             — the side-by-side divider (`sm:` and up only).
 *   col 4 `minmax(0,1fr)`   — the answer-and-links block (one wrapper: the
 *                              field/options, then the "Agregar opciones /
 *                              Editor avanzado" row) — ONE column, so the
 *                              answer and its links always share an edge
 *                              with each other for free.
 *   col 5 `2.75rem`         — the delete "×". `2.75rem`, not the old
 *                              `2.25rem`: `RowRemoveButton` already grows to
 *                              `size-10` (40px) on a coarse pointer
 *                              (`TemplateEditorKit.tsx`), which the old 36px
 *                              track was too narrow for — the "×" rendered
 *                              10px into the answer field. This widens the
 *                              TRACK to fit the button that already exists,
 *                              never the button itself (owner note: no 44px
 *                              button resize without sign-off).
 *
 * BELOW `sm` (640px, reviewer follow-up on the first H14 pass): a real
 * activity's question column measured ~129px wide and cut its own text
 * ("What color is t"), and the first stacked attempt still overflowed the
 * card (question ran edge to edge with no right padding) and left the
 * answer/links sharing NEITHER the card's own padding NOR the question's
 * own text column. `col-start-*`/`row-start-*` on each piece below (not a
 * second, hand-rolled mobile layout) is what fixes both at once: columns 1
 * (handle), 2 (question/image/answer/links) and 5 (delete) stay the grid's
 * own 3 effective tracks (`auto minmax(0,1fr) auto` — divider/answer merge
 * into column 2's single `1fr` track, delete reuses column 5's own slot),
 * with the handle+question+delete sharing row 1 (so the "×" stays ON SCREEN
 * beside the question, never pushed into its own far-right row), the image
 * action in row 2, and the answer-and-links block in row 3 — all three
 * still in column 2, so they share the exact same left edge as the question
 * field above them, by construction, not by matching paddings.
 *
 * Exported so `QuizBlockEditor.tsx`'s own column headers and ghost row line
 * up with these rows.
 */
export const ROW_GRID =
  'grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 gap-y-3 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_1px_minmax(0,1fr)_2.75rem] sm:gap-x-0 sm:gap-y-1';

/** Column-header-only variant of {@link ROW_GRID} (owner build, H14 follow-up): a stacked mobile row has nothing to pair "Pregunta"/"Respuesta" against, so the header hides entirely below `sm` instead of stacking those two labels with a blank line between — each field's own placeholder/`aria-label` already says what it is. Same `px-4` as a real row, so the labels start over their own columns. */
export const ROW_GRID_HEADER =
  'hidden sm:grid sm:grid-cols-[auto_minmax(0,1fr)_1px_minmax(0,1fr)_2.75rem] sm:items-start sm:px-4';

/** The side-by-side divider bar — a stray 1px tick with nothing beside it once the row stacks (H14), so it only renders from `sm` up, same breakpoint as {@link ROW_GRID}'s own column switch. Exported so `QuizBlockEditor.tsx`'s own ghost row matches. */
export const ROW_DIVIDER_CLASS =
  'hidden h-7 w-px bg-foreground/[0.08] sm:col-start-3 sm:row-start-1 sm:row-span-2 sm:block';

export default function VariosJuegosRow(props: VariosJuegosRowProps) {
  const {
    slot,
    index,
    lang,
    poolItems,
    dragHandle,
    highlighted = false,
    incompleteMessage = null,
    onLabelChange,
    onTypeChange,
    onMarkCorrect,
    onAddOption,
    onRemoveOption,
    onSetOptionText,
    onAnswerChange,
    onDelete,
    onPasteIntoRow,
    promptImage,
    onPromptImageChange,
  } = props;
  const t = copyFor(lang);
  const [manualAdvanced, setManualAdvanced] = useState(false);
  const forcedAdvanced = needsAdvancedEditor(slot.input, slot.answer.length);
  const showAdvanced = forcedAdvanced || manualAdvanced;
  const segment = segmentForInput(slot.input);

  if (showAdvanced) {
    return (
      <div data-testid={`varios-row-${slot.id}`} className="flex flex-col gap-1">
        {!forcedAdvanced && (
          <button
            type="button"
            data-testid={`varios-advanced-toggle-${slot.id}`}
            onClick={() => setManualAdvanced(false)}
            className="w-fit text-xs font-medium text-accent-ink hover:underline"
          >
            {t.closeAdvanced}
          </button>
        )}
        <QuestionCard {...props} />
      </div>
    );
  }

  return (
    <TemplateRow testId={`varios-row-${slot.id}`}>
      <div
        data-highlighted={highlighted ? 'true' : undefined}
        className={cn(ROW_GRID, highlighted && 'ring-2 ring-primary')}
      >
        {/* Own grid column (col 1) at every width now — H14 reviewer
            follow-up: nesting the handle INSIDE the question field's own
            box (the first H14 pass) pushed the question's "Quitar imagen"
            action out of line with the answer/links block below, because
            only the question's own wrapper carried the handle's extra
            width. A dedicated column means every OTHER piece in column 2
            (question, image action, answer, links) shares one left edge by
            construction. `self-center` (overriding the grid's own
            `items-start`) centers the handle against row 1's own height —
            the question field's 40px fixed height (`.template-field`,
            global.css), never a guessed top offset. */}
        <div className="col-start-1 row-start-1 self-center">{dragHandle}</div>
        <TemplateField
          aria-label={`${t.questionLabel} ${index}`}
          placeholder={t.questionPlaceholder}
          data-testid={`varios-question-${slot.id}`}
          value={slot.label}
          onChange={(event) => onLabelChange(event.target.value)}
          onPaste={onPasteIntoRow}
          className="col-start-2 row-start-1 min-w-0"
        />
        {onPromptImageChange && (
          <div className="col-start-2 row-start-2 min-w-0">
            <QuestionImageField lang={lang} slotId={slot.id} image={promptImage} onChange={onPromptImageChange} />
          </div>
        )}
        <span aria-hidden="true" className={ROW_DIVIDER_CLASS} />
        <div className="col-start-2 row-start-3 flex min-w-0 flex-col gap-2 sm:col-start-4 sm:row-start-1 sm:row-span-2">
          {segment === 'choice' ? (
            <div className="flex flex-wrap gap-2" data-testid={`varios-options-${slot.id}`}>
              {poolItems.map((item) => {
                const correct = slot.answer[0] === item.id;
                return (
                  // Kit chip (`chip.ts`'s own `CHIP_INLINE` — never a new,
                  // parallel capsule): the correct option is marked by the
                  // success token's wash/ring PLUS a ✓ glyph, never color
                  // alone (owner spec, rule 8 "legibilidad y contraste antes
                  // que estilo").
                  <div
                    key={item.id}
                    className={cn(
                      CHIP_INLINE,
                      'w-fit gap-1.5 pr-2',
                      correct && 'bg-success-strong/10 ring-2 ring-success-strong',
                    )}
                  >
                    <input
                      type="radio"
                      name={`${slot.id}-varios-correct`}
                      aria-label={t.markCorrect}
                      data-testid={`varios-option-correct-${slot.id}-${item.id}`}
                      checked={correct}
                      onChange={() => onMarkCorrect(item.id)}
                      className="size-4 shrink-0 accent-primary"
                    />
                    <TemplateField
                      aria-label={t.optionPlaceholder}
                      placeholder={t.optionPlaceholder}
                      data-testid={`varios-option-text-${slot.id}-${item.id}`}
                      value={item.text ?? ''}
                      onChange={(event) => onSetOptionText(item.id, event.target.value)}
                      className={cn('w-28', correct && 'font-medium text-success-strong')}
                    />
                    {correct && (
                      <CheckIcon
                        aria-hidden="true"
                        size={14}
                        weight="bold"
                        className="shrink-0 text-success-strong"
                      />
                    )}
                    <button
                      type="button"
                      aria-label={t.removeOption}
                      data-testid={`varios-option-remove-${slot.id}-${item.id}`}
                      onClick={() => onRemoveOption(item.id)}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                data-testid={`varios-option-add-${slot.id}`}
                onClick={onAddOption}
                className="w-fit text-sm font-medium text-accent-ink hover:underline"
              >
                {t.addOption}
              </button>
            </div>
          ) : (
            <TemplateField
              aria-label={`${t.answerLabel} ${index}`}
              placeholder={t.answerPlaceholder}
              data-testid={`varios-answer-${slot.id}`}
              value={slot.answer[0] ?? ''}
              onChange={(event) => onAnswerChange(event.target.value.trim() === '' ? [] : [event.target.value])}
              onPaste={onPasteIntoRow}
            />
          )}

          {incompleteMessage && (
            <p data-testid={`question-incomplete-${slot.id}`} className="text-sm text-destructive">
              {incompleteMessage}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid={segment === 'choice' ? `varios-remove-options-${slot.id}` : `varios-add-options-${slot.id}`}
              onClick={() => onTypeChange(segment === 'choice' ? 'text' : 'choice', false)}
              className="w-fit text-xs font-medium text-accent-ink hover:underline"
            >
              {segment === 'choice' ? t.removeOptions : t.addOptions}
            </button>
            <button
              type="button"
              data-testid={`varios-advanced-toggle-${slot.id}`}
              onClick={() => setManualAdvanced(true)}
              className="w-fit text-xs font-medium text-accent-ink hover:underline"
            >
              {t.openAdvanced}
            </button>
          </div>
        </div>
        {/* Same row as the handle+question (col 3 at mobile, so the "x"
            stays ON SCREEN right beside the question instead of its own
            far-right row below everything else); col 5 spanning both rows
            at `sm:`, matching the original side-by-side design. */}
        <div className="col-start-3 row-start-1 flex justify-end self-center sm:col-start-5 sm:row-span-2 sm:self-start">
          <RowRemoveButton label={`${t.removeRow} ${index}`} testId={`varios-remove-${slot.id}`} onRemove={onDelete} />
        </div>
      </div>
    </TemplateRow>
  );
}
