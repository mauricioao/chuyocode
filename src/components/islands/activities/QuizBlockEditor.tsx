/**
 * QuizBlockEditor — one `quiz` block's own editor inside the activity
 * editor's block list (PR C, "Preguntas (quiz) block"), mounted by
 * `BlockList` exactly where `WorksheetZoneEditor` is mounted for a
 * `worksheet` block.
 *
 * A "question" here is one {@link Slot}, referenced by one `row` block —
 * exactly the shape the curated `/admin/ejercicios` authoring surface
 * already uses (`authoringDraft.ts`'s own header). This editor REUSES that
 * surface's pure `Draft` mutations and its `RowBlockEditor`/
 * `SlotAnswerEditor` components verbatim rather than forking them: a quiz
 * block's payload IS a `Payload`, so the same `payloadToDraft`/
 * `draftToPayload` round-trip applies unchanged. Unlike the curated
 * authoring surface, this editor never adds `prose`/`media` context blocks
 * — a quiz question here is a self-contained sentence + answer, matching
 * the task's own scope ("each question = one slot").
 *
 * CONTEXTUAL PANEL, LIKE A WORKSHEET ZONE: the question LIST is a compact,
 * reorderable summary; selecting one opens its full editor (sentence, gap
 * preview, mechanic, answers) in a panel below — `selectedSlotId`/
 * `onSelectSlot` are the same generic "selected sub-item" state
 * `ActivityEditorIsland` already threads through as `selectedZoneId` for
 * worksheet zones, reused here for quiz questions (Escape deselects either
 * one for free).
 *
 * IDS ARE THIS COMPONENT'S JOB, same rule `ExerciseAuthorIsland.tsx`
 * documents for `authoringDraft.ts`'s own mutations: a plain incrementing
 * counter, seeded from the block's own id so two quiz blocks minting ids in
 * the same render never collide.
 *
 * COPY IS LOCAL, matching the convention of the components this one wraps
 * (`RowBlockEditor`/`SlotAnswerEditor`), not `UI_LABELS` — see those files'
 * own headers for why.
 */
import { useRef } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DotsSixVerticalIcon } from '@phosphor-icons/react/dist/ssr/DotsSixVertical';
import type { Payload, RowBlock } from '@/lib/exercisePayload';
import {
  addRowBlock,
  draftToPayload,
  payloadToDraft,
  removeBlock,
  setPool,
  setRowLabel,
  setSlotAnswer,
  setSlotInput,
  setSlotPool,
  type Draft,
} from '@/lib/authoringDraft';
import RowBlockEditor from '@/components/islands/authoring/RowBlockEditor';
import SlotAnswerEditor from '@/components/islands/authoring/SlotAnswerEditor';

export const COPY = {
  es: {
    addQuestion: 'Agregar pregunta',
    noQuestionsYet: 'Todavía no hay preguntas. Agregar la primera.',
    selectQuestionHint: 'Elegir una pregunta de la lista para editarla.',
    dragHandle: 'Reordenar pregunta',
    deleteQuestion: 'Eliminar pregunta',
    questionLabel: 'Pregunta',
    emptyQuestionPreview: '(Sin enunciado todavía)',
  },
  en: {
    addQuestion: 'Add question',
    noQuestionsYet: 'No questions yet. Add the first one.',
    selectQuestionHint: 'Choose a question from the list to edit it.',
    dragHandle: 'Reorder question',
    deleteQuestion: 'Delete question',
    questionLabel: 'Question',
    emptyQuestionPreview: '(No sentence yet)',
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

function copyFor(lang: string): Copy {
  return lang === 'en' ? COPY.en : COPY.es;
}

export interface QuizBlockEditorProps {
  blockId: string;
  lang: string;
  payload: Payload;
  selectedSlotId: string | null;
  onSelectSlot: (slotId: string | null) => void;
  onPayloadChange: (payload: Payload) => void;
  /** The exact question `findIncompleteBlock` pointed back to on a rejected submit — `null`/absent otherwise. */
  incompleteSlotId?: string | null;
  incompleteMessage?: string | null;
}

/** One row block's slot id — only `row` blocks are ever authored here. */
function rowSlotId(draft: Draft, rowId: string): string | null {
  const block = draft.blocks.find((b) => b.id === rowId);
  return block?.kind === 'row' ? block.slotId : null;
}

function SortableQuestionRow({
  id,
  handleLabel,
  children,
}: {
  id: string;
  handleLabel: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition: transition ?? undefined }}
      data-dragging={isDragging ? 'true' : undefined}
      className="flex items-center gap-1 rounded-md border border-border px-1 py-1"
    >
      <button
        type="button"
        aria-label={handleLabel}
        className="flex shrink-0 touch-none cursor-grab items-center justify-center rounded p-1 text-muted-foreground outline-none hover:bg-muted hover:text-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <DotsSixVerticalIcon aria-hidden="true" />
      </button>
      {children}
    </li>
  );
}

export default function QuizBlockEditor({
  blockId,
  lang,
  payload,
  selectedSlotId,
  onSelectSlot,
  onPayloadChange,
  incompleteSlotId = null,
  incompleteMessage = null,
}: QuizBlockEditorProps) {
  const t = copyFor(lang);
  const draft = payloadToDraft(payload);
  const questions = draft.blocks.filter((b): b is RowBlock => b.kind === 'row');

  const counterRef = useRef(0);
  function nextId(prefix: string): string {
    counterRef.current += 1;
    return `${blockId}-${prefix}-${counterRef.current}-${Date.now().toString(36)}`;
  }

  function commit(nextDraft: Draft) {
    onPayloadChange(draftToPayload(nextDraft));
  }

  function addQuestion() {
    const rowId = nextId('row');
    const slotId = nextId('slot');
    commit(addRowBlock(draft, rowId, slotId));
    onSelectSlot(slotId);
  }

  function removeQuestion(rowId: string, slotId: string) {
    commit(removeBlock(draft, rowId));
    if (selectedSlotId === slotId) onSelectSlot(null);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const oldIndex = questions.findIndex((q) => q.id === active.id);
    const newIndex = questions.findIndex((q) => q.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reorderedQuestions = arrayMove(questions, oldIndex, newIndex);
    // Only `row` blocks exist in a quiz block's own `draft.blocks` (this
    // editor never adds prose/media), so replacing the whole array with the
    // reordered one is safe — no other block kind to preserve a position for.
    commit({ ...draft, blocks: reorderedQuestions });
  }

  const selectedSlot = selectedSlotId ? draft.slots.find((s) => s.id === selectedSlotId) ?? null : null;
  const selectedRowId = selectedSlot
    ? draft.blocks.find((b) => b.kind === 'row' && b.slotId === selectedSlot.id)?.id
    : undefined;

  return (
    <div className="flex flex-col gap-3" data-testid={`quiz-editor-${blockId}`}>
      {questions.length === 0 ? (
        <p data-testid={`quiz-empty-${blockId}`} className="text-sm text-muted-foreground">
          {t.noQuestionsYet}
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
            <ul data-testid={`quiz-question-list-${blockId}`} className="flex flex-col gap-1">
              {questions.map((question, index) => {
                const slotId = rowSlotId(draft, question.id);
                const slot = slotId ? draft.slots.find((s) => s.id === slotId) : undefined;
                const selected = slotId !== null && slotId === selectedSlotId;
                const preview = slot?.label.trim() || t.emptyQuestionPreview;
                return (
                  <SortableQuestionRow key={question.id} id={question.id} handleLabel={t.dragHandle}>
                    <button
                      type="button"
                      data-testid={`select-question-${slot?.id ?? question.id}`}
                      aria-pressed={selected}
                      onClick={() => slotId && onSelectSlot(slotId)}
                      className={`min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-sm ${
                        selected ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {index + 1}. {preview}
                    </button>
                    <button
                      type="button"
                      aria-label={t.deleteQuestion}
                      data-testid={`delete-question-${slot?.id ?? question.id}`}
                      className="shrink-0 px-2 text-sm text-muted-foreground hover:text-destructive"
                      onClick={() => slotId && removeQuestion(question.id, slotId)}
                    >
                      &times;
                    </button>
                  </SortableQuestionRow>
                );
              })}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <button
        type="button"
        data-testid={`add-question-${blockId}`}
        onClick={addQuestion}
        className="w-fit rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
      >
        + {t.addQuestion}
      </button>

      {selectedSlot ? (
        <div
          data-testid={`quiz-question-panel-${selectedSlot.id}`}
          className="flex flex-col gap-2 rounded-md border border-border p-3"
        >
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t.questionLabel}
          </span>
          <RowBlockEditor
            slot={selectedSlot}
            lang={lang}
            onLabelChange={(label) => commit(setRowLabel(draft, selectedSlot.id, label))}
            onRemove={() => selectedRowId && removeQuestion(selectedRowId, selectedSlot.id)}
            answerEditor={
              <SlotAnswerEditor
                slot={selectedSlot}
                lang={lang}
                poolItems={selectedSlot.pool ? (draft.pools[selectedSlot.pool] ?? []) : []}
                poolNames={Object.keys(draft.pools)}
                onMechanicChange={(input) => commit(setSlotInput(draft, selectedSlot.id, input))}
                onPoolNameChange={(poolName) => commit(setSlotPool(draft, selectedSlot.id, poolName))}
                onAnswerChange={(answer) => commit(setSlotAnswer(draft, selectedSlot.id, answer))}
                onAddPoolItem={(text) => {
                  if (!selectedSlot.pool) return;
                  const item = { id: nextId('item'), text };
                  const existing = draft.pools[selectedSlot.pool] ?? [];
                  commit(setPool(draft, selectedSlot.pool, [...existing, item]));
                }}
                onRemovePoolItem={(itemId) => {
                  if (!selectedSlot.pool) return;
                  const existing = draft.pools[selectedSlot.pool] ?? [];
                  commit(setPool(draft, selectedSlot.pool, existing.filter((item) => item.id !== itemId)));
                }}
                onSetPoolItemText={(itemId, text) => {
                  if (!selectedSlot.pool) return;
                  const existing = draft.pools[selectedSlot.pool] ?? [];
                  commit(
                    setPool(
                      draft,
                      selectedSlot.pool,
                      existing.map((item) => (item.id === itemId ? { ...item, text } : item)),
                    ),
                  );
                }}
                onSetPoolItemMedia={(itemId, media) => {
                  if (!selectedSlot.pool) return;
                  const existing = draft.pools[selectedSlot.pool] ?? [];
                  commit(
                    setPool(
                      draft,
                      selectedSlot.pool,
                      existing.map((item) => {
                        if (item.id !== itemId) return item;
                        const next = { ...item };
                        if (media === undefined) delete next.media;
                        else next.media = media;
                        return next;
                      }),
                    ),
                  );
                }}
              />
            }
          />
          {incompleteSlotId === selectedSlot.id && incompleteMessage && (
            <p data-testid={`quiz-incomplete-${selectedSlot.id}`} className="text-sm text-destructive">
              {incompleteMessage}
            </p>
          )}
        </div>
      ) : (
        questions.length > 0 && (
          <p data-testid={`quiz-panel-empty-${blockId}`} className="text-sm text-muted-foreground">
            {t.selectQuestionHint}
          </p>
        )
      )}
    </div>
  );
}
