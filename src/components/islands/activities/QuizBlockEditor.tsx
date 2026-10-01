/**
 * QuizBlockEditor — one `quiz` block's own editor inside the activity
 * editor's block list, mounted by `BlockList` exactly where
 * `WorksheetZoneEditor` is mounted for a `worksheet` block.
 *
 * REDESIGN (owner-approved v2, "Preguntas editor redesign"): a "question"
 * here is one {@link Slot}, referenced by one `row` block — exactly the
 * shape the curated `/admin/ejercicios` authoring surface already uses. The
 * STORED DATA MODEL is unchanged; only the authoring surface changed, from a
 * compact list + select-to-reveal panel to a Google Forms-style scrollable
 * list of always-editable {@link QuestionCard}s. Every card mutation flows
 * through `authoringDraft.ts`'s pure setters (plus `quizQuestionType.ts`'s
 * `changeQuestionSegment` for the friendlier choice/text/gap type control),
 * exactly as the previous panel did.
 *
 * ONE ADD AFFORDANCE: the trailing "+ Agregar pregunta" button, or
 * Ctrl/Cmd+Enter anywhere inside the block (captured on the outer container,
 * so it works regardless of which field currently has focus).
 *
 * THE CHECKLIST (owner build item 5) reuses `quizChecklist.ts`'s
 * `listIncompleteQuestions` — the same "what still blocks a submit" rules
 * `activities/blocks.ts`'s `findIncompleteSlot` enforces server-side —
 * so clicking an item scrolls/highlights the exact question it names.
 *
 * IDS ARE THIS COMPONENT'S JOB, same rule `authoringDraft.ts` documents: a
 * plain incrementing counter, seeded from the block's own id so two quiz
 * blocks minting ids in the same render never collide.
 */
import { useEffect, useRef } from 'react';
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
import { CheckCircleIcon } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { DotsSixVerticalIcon } from '@phosphor-icons/react/dist/ssr/DotsSixVertical';
import { Button } from '@/components/ui/button';
import type { PoolItem, RowBlock, Slot } from '@/lib/exercisePayload';
import {
  addRowBlock,
  draftToPayload,
  payloadToDraft,
  removeBlock,
  setPool,
  setRowLabel,
  setSlotAnswer,
  setSlotExplanation,
  type Draft,
} from '@/lib/authoringDraft';
import { changeQuestionSegment, type QuestionSegment } from '@/lib/quizQuestionType';
import { listIncompleteQuestions, type ChecklistReason } from '@/lib/quizChecklist';
import type { Payload } from '@/lib/exercisePayload';
import QuestionCard from './QuestionCard';

export const COPY = {
  es: {
    addQuestion: 'Agregar pregunta',
    noQuestionsYet: 'Agrega tu primera pregunta',
    dragHandle: 'Reordenar pregunta',
    questionsCount: (n: number) => (n === 1 ? '1 pregunta' : `${n} preguntas`),
    allComplete: 'todas con respuesta',
    reason: (n: number, reason: ChecklistReason): string => {
      switch (reason) {
        case 'quiz_no_answer':
          return `Pregunta ${n}: falta marcar la respuesta correcta`;
        case 'quiz_too_few_options':
          return `Pregunta ${n}: agrega al menos 2 opciones`;
        case 'quiz_answer_not_in_pool':
          return `Pregunta ${n}: vuelve a marcar la opción correcta`;
      }
    },
  },
  en: {
    addQuestion: 'Add question',
    noQuestionsYet: 'Add your first question',
    dragHandle: 'Reorder question',
    questionsCount: (n: number) => (n === 1 ? '1 question' : `${n} questions`),
    allComplete: 'all with an answer',
    reason: (n: number, reason: ChecklistReason): string => {
      switch (reason) {
        case 'quiz_no_answer':
          return `Question ${n}: mark the correct answer`;
        case 'quiz_too_few_options':
          return `Question ${n}: add at least 2 options`;
        case 'quiz_answer_not_in_pool':
          return `Question ${n}: mark the correct option again`;
      }
    },
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

function SortableQuestionCard({
  id,
  registerNode,
  dragHandleLabel,
  children,
}: {
  id: string;
  registerNode: (node: HTMLLIElement | null) => void;
  dragHandleLabel: string;
  children: (dragHandle: React.ReactNode) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const dragHandle = (
    <button
      type="button"
      aria-label={dragHandleLabel}
      className="mt-2 flex shrink-0 touch-none cursor-grab items-center justify-center rounded p-1 text-muted-foreground outline-none hover:bg-muted hover:text-foreground active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <DotsSixVerticalIcon aria-hidden="true" />
    </button>
  );

  return (
    <li
      ref={(node) => {
        setNodeRef(node);
        registerNode(node);
      }}
      style={{ transform: CSS.Transform.toString(transform), transition: transition ?? undefined }}
      data-dragging={isDragging ? 'true' : undefined}
      className="list-none"
    >
      {children(dragHandle)}
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
  const checklist = listIncompleteQuestions(draft);

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

  function duplicateQuestion(rowId: string, slotId: string) {
    const slot = draft.slots.find((s) => s.id === slotId);
    if (!slot) return;

    const newSlotId = nextId('slot');
    const newRowId = nextId('row');
    let newSlot: Slot = { ...slot, id: newSlotId };
    let pools = draft.pools;

    if (slot.pool) {
      const newPoolName = `${newSlotId}-options`;
      const items = draft.pools[slot.pool] ?? [];
      const idMap = new Map<string, string>();
      const newItems: PoolItem[] = items.map((item) => {
        const newItemId = nextId('item');
        idMap.set(item.id, newItemId);
        return { ...item, id: newItemId };
      });
      newSlot = { ...newSlot, pool: newPoolName, answer: slot.answer.map((a) => idMap.get(a) ?? a) };
      pools = { ...pools, [newPoolName]: newItems };
    }

    const newRow: RowBlock = { kind: 'row', id: newRowId, slotId: newSlotId };
    const rowIndex = draft.blocks.findIndex((b) => b.id === rowId);
    const blocks = [...draft.blocks];
    blocks.splice(rowIndex === -1 ? blocks.length : rowIndex + 1, 0, newRow);

    commit({ ...draft, slots: [...draft.slots, newSlot], blocks, pools });
    onSelectSlot(newSlotId);
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
    commit({ ...draft, blocks: reorderedQuestions });
  }

  // Ctrl/Cmd+Enter anywhere inside this block adds the next question and
  // focuses it — captured on the outer container so it fires no matter
  // which field inside a card currently has focus (item 2's second add
  // affordance, alongside the trailing button).
  function handleContainerKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    addQuestion();
  }

  const cardNodeRefs = useRef<Record<string, HTMLLIElement | null>>({});
  useEffect(() => {
    if (!selectedSlotId) return;
    cardNodeRefs.current[selectedSlotId]?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [selectedSlotId]);

  return (
    <div
      className="flex flex-col gap-3"
      data-testid={`quiz-editor-${blockId}`}
      onKeyDownCapture={handleContainerKeyDown}
    >
      {questions.length > 0 && (
        <div data-testid={`quiz-checklist-${blockId}`} className="flex flex-col gap-1 rounded-md border border-border p-2">
          {checklist.length === 0 ? (
            <span className="flex items-center gap-1.5 text-sm text-foreground">
              <CheckCircleIcon aria-hidden="true" weight="fill" className="text-primary" />
              {t.questionsCount(questions.length)} · {t.allComplete}
            </span>
          ) : (
            <>
              <span className="text-sm text-muted-foreground">{t.questionsCount(questions.length)}</span>
              {checklist.map((item) => (
                <button
                  key={item.slotId}
                  type="button"
                  data-testid={`quiz-checklist-item-${blockId}-${item.slotId}`}
                  onClick={() => onSelectSlot(item.slotId)}
                  className="w-fit text-left text-sm text-destructive hover:underline"
                >
                  {t.reason(item.index, item.reason)}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {questions.length === 0 ? (
        <div
          data-testid={`quiz-empty-${blockId}`}
          className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-8 text-center"
        >
          <p className="text-sm font-medium text-foreground">{t.noQuestionsYet}</p>
          <Button type="button" variant="primary" data-testid={`add-question-${blockId}`} onClick={addQuestion}>
            + {t.addQuestion}
          </Button>
        </div>
      ) : (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
              <ul data-testid={`quiz-question-list-${blockId}`} className="flex flex-col gap-3">
                {questions.map((question, index) => {
                  const slotId = rowSlotId(draft, question.id);
                  const slot = slotId ? draft.slots.find((s) => s.id === slotId) : undefined;
                  if (!slot || !slotId) return null;
                  const poolItems = slot.pool ? (draft.pools[slot.pool] ?? []) : [];

                  return (
                    <SortableQuestionCard
                      key={question.id}
                      id={question.id}
                      dragHandleLabel={t.dragHandle}
                      registerNode={(node) => {
                        cardNodeRefs.current[slotId] = node;
                      }}
                    >
                      {(dragHandle) => (
                        <QuestionCard
                          slot={slot}
                          index={index + 1}
                          lang={lang}
                          poolItems={poolItems}
                          dragHandle={dragHandle}
                          highlighted={selectedSlotId === slot.id}
                          incompleteMessage={incompleteSlotId === slot.id ? incompleteMessage : null}
                          onLabelChange={(label) => commit(setRowLabel(draft, slot.id, label))}
                          onTypeChange={(segment: QuestionSegment, asDrop: boolean) =>
                            commit(changeQuestionSegment(draft, slot.id, segment, asDrop, () => nextId('item')))
                          }
                          onMarkCorrect={(itemId) => commit(setSlotAnswer(draft, slot.id, [itemId]))}
                          onAddOption={() => {
                            // `onAddOption` is only reachable while the card shows a pooled
                            // type (choice/gap), and `changeQuestionSegment` always names a
                            // pool before switching a slot into one of those — `slot.pool` is
                            // therefore always set here; the fallback name just keeps this
                            // callback total instead of assuming that invariant silently.
                            const poolName = slot.pool ?? `${slot.id}-options`;
                            const existing = draft.pools[poolName] ?? [];
                            const item: PoolItem = { id: nextId('item'), text: '' };
                            commit(setPool(draft, poolName, [...existing, item]));
                          }}
                          onRemoveOption={(itemId) => {
                            if (!slot.pool) return;
                            const existing = draft.pools[slot.pool] ?? [];
                            commit(setPool(draft, slot.pool, existing.filter((item) => item.id !== itemId)));
                          }}
                          onSetOptionText={(itemId, text) => {
                            if (!slot.pool) return;
                            const existing = draft.pools[slot.pool] ?? [];
                            commit(
                              setPool(
                                draft,
                                slot.pool,
                                existing.map((item) => (item.id === itemId ? { ...item, text } : item)),
                              ),
                            );
                          }}
                          onAnswerChange={(answer) => commit(setSlotAnswer(draft, slot.id, answer))}
                          onExplanationChange={(explanation) => commit(setSlotExplanation(draft, slot.id, explanation))}
                          onDuplicate={() => duplicateQuestion(question.id, slot.id)}
                          onDelete={() => removeQuestion(question.id, slot.id)}
                        />
                      )}
                    </SortableQuestionCard>
                  );
                })}
              </ul>
            </SortableContext>
          </DndContext>

          <button
            type="button"
            data-testid={`add-question-${blockId}`}
            onClick={addQuestion}
            className="w-fit rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            + {t.addQuestion}
          </button>
        </>
      )}
    </div>
  );
}
