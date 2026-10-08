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
 *
 * THE EXAMPLE-FIRST EMPTY STATE (owner build item 4): a brand-new block
 * offers `quizExampleQuestions.ts`'s 3 ready-made A1 questions as a
 * read-only preview, with "Usar este ejemplo" (fills the block, submit-ready)
 * or "Empezar en blanco" (today's single empty question, focused).
 *
 * THE LIVE PREVIEW (owner build items 3 and 8) sits beside the question
 * column on desktop and behind a "Vista previa" tab on phones — a PURE CSS
 * layout (`lg:grid-cols-2` plus `max-lg:hidden` toggled by `mobileTab`), not
 * a structural `isDesktop`-branched remount: the exact same DOM renders on
 * server and client either way, so there is no hydration-flash concern and
 * no duplicate ids to reconcile, unlike a genuine two-subtree split. `payload`
 * reaches {@link QuizLivePreview} already debounced (~300ms,
 * `useDebouncedValue`) so fast typing in a card does not reset the preview's
 * own in-progress answers on every keystroke.
 *
 * FIRST-RUN TIPS (owner build item 6): a 3-step tour anchored to the FIRST
 * question card's text field, its type control, and the trailing "+ Agregar
 * pregunta" button — `useFirstRunTips` persists "seen" to `localStorage` so
 * it shows once per browser; `QuizFirstRunTip` anchors each bubble by CSS,
 * never a blocking overlay. Only the first card is ever wrapped (`index ===
 * 0`), so adding a 2nd+ question never grows a 2nd tour.
 */
import { useEffect, useId, useRef, useState } from 'react';
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
import { createExampleDraft, EXAMPLE_QUESTION_PROMPTS } from '@/lib/quizExampleQuestions';
import type { Payload } from '@/lib/exercisePayload';
import type { QuizTemplate } from '@/lib/activities/blocks';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useFirstRunTips } from '@/hooks/useFirstRunTips';
import { cn } from '@/lib/utils';
import QuestionCard from './QuestionCard';
import QuizLivePreview from './QuizLivePreview';
import QuizFirstRunTip from './QuizFirstRunTip';
import MatchPairsEditor, { type MatchPair } from './MatchPairsEditor';
import ReorderEditor, { type ReorderSentence } from './ReorderEditor';

/** Bumped only if the tour's steps/anchors change shape enough that a learner who dismissed the old one should see the new one. */
const FIRST_RUN_TIPS_KEY = 'chuyo:quiz-editor-tips-v1';
const FIRST_RUN_TIPS_STEPS = 3;

export const COPY = {
  es: {
    addQuestion: 'Agregar pregunta',
    noQuestionsYet: 'Agrega tu primera pregunta',
    useExample: 'Usar este ejemplo',
    startBlank: 'Empezar en blanco',
    dragHandle: 'Reordenar pregunta',
    tabQuestions: 'Preguntas',
    tabPreview: 'Vista previa',
    tip1: 'Escribe la pregunta',
    tip2: 'Toca el círculo de la correcta',
    tip3: 'Agrega otra pregunta',
    tipNext: 'Siguiente',
    tipDone: 'Listo',
    tipDismiss: 'Omitir',
    questionsCount: (n: number) => (n === 1 ? '1 pregunta' : `${n} preguntas`),
    allComplete: 'todas con respuesta',
    reason: (n: number, reason: ChecklistReason): string => {
      switch (reason) {
        case 'quiz_no_answer':
          return `Pregunta ${n}: marca la respuesta correcta`;
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
    useExample: 'Use this example',
    startBlank: 'Start blank',
    dragHandle: 'Reorder question',
    tabQuestions: 'Questions',
    tabPreview: 'Preview',
    tip1: 'Write the question',
    tip2: "Tap the correct answer's circle",
    tip3: 'Add another question',
    tipNext: 'Next',
    tipDone: 'Done',
    tipDismiss: 'Skip',
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
  /** The block's authoring preset (`blocks.ts`'s own `QuizTemplate`) — `'match'` swaps the whole question list for {@link MatchPairsEditor}; `undefined` ("Básico") keeps this file's own Google-Forms-style list. */
  template?: QuizTemplate;
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
      className="mt-2 flex max-lg:min-h-11 max-lg:min-w-11 shrink-0 touch-none cursor-grab items-center justify-center rounded p-1 text-muted-foreground outline-none hover:bg-muted hover:text-foreground active:cursor-grabbing"
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

/** Each column (questions, preview) scrolls on its own inside the desktop focus block. */
const QUIZ_COLUMN_CLASS = 'min-w-0 lg:min-h-0 lg:overflow-y-auto lg:pr-1 lg:[scrollbar-gutter:stable]';

export default function QuizBlockEditor({
  blockId,
  lang,
  payload,
  template,
  selectedSlotId,
  onSelectSlot,
  onPayloadChange,
  incompleteSlotId = null,
  incompleteMessage = null,
}: QuizBlockEditorProps) {
  const t = copyFor(lang);
  const isMatch = template === 'match';
  const isReorder = template === 'reorder';
  const draft = payloadToDraft(payload);
  const questions = draft.blocks.filter((b): b is RowBlock => b.kind === 'row');
  const checklist = listIncompleteQuestions(draft);
  // Several QuizBlockEditor instances can be mounted on one page (one per
  // expanded quiz block in BlockList.tsx), so this must NOT be a fixed
  // string — same reasoning DropRenderer.tsx documents at its own
  // `DndContext`: dnd-kit's auto-generated id is a module-level counter that
  // disagrees between the server render and the client hydration of a
  // long-lived SSR process. `useId()` is stable across both passes AND
  // unique per instance on one page, which a fixed string could not be.
  const dndId = useId();
  const [mobileTab, setMobileTab] = useState<'questions' | 'preview'>('questions');
  const debouncedPayload = useDebouncedValue(payload, 300);
  const tips = useFirstRunTips(FIRST_RUN_TIPS_KEY, FIRST_RUN_TIPS_STEPS);

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

  function useExample() {
    commit(createExampleDraft(() => nextId('ex')));
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
    // `block: 'nearest'` (scroll bug fix, owner report: "se rompe el scroll
    // y no deja llegar a la parte superior") — `'center'` asked EVERY
    // scrollable ancestor along the way to re-center the target, including
    // several wrappers up this chain that only exist to CLIP their content
    // (`overflow: hidden`, no visible scrollbar — `activity-editor-card` in
    // `ActivityEditorIsland.tsx`, confirmed the culprit) rather than to
    // actually scroll it. Those are now `overflow: clip` (cannot be
    // scrolled programmatically at all, see that file's own comment), but
    // 'nearest' is kept too: it only moves the ONE real scroll container
    // (this column, `QUIZ_COLUMN_CLASS`) the minimum needed, instead of
    // re-centering it on every add/select — gentler, and never a reason by
    // itself for an ancestor to move.
    cardNodeRefs.current[selectedSlotId]?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [selectedSlotId]);

  const hasQuestions = questions.length > 0;

  // MATCH AUTHORING, SIMPLE (build item 1): a `match` block is a list of
  // PAIRS, not questions — `MatchPairsEditor` renders the same `row`+`Slot`
  // storage as a minimal "Pregunta | Respuesta" table instead of the full
  // Básico question-card list, which offers controls (type/options) that
  // make no sense for a pair. The underlying commits are UNCHANGED:
  // `addQuestion`/`removeQuestion` already add/remove exactly one
  // row+slot, and `setRowLabel`/`setSlotAnswer` already replace a slot's
  // label/answer — only the rendering differs.
  const matchPairs: MatchPair[] = isMatch
    ? questions.flatMap((question): MatchPair[] => {
        const slotId = rowSlotId(draft, question.id);
        const slot = slotId ? draft.slots.find((s) => s.id === slotId) : undefined;
        if (!slot || !slotId) return [];
        return [{ rowId: question.id, slotId, question: slot.label, answer: slot.answer[0] ?? '' }];
      })
    : [];

  const matchColumn = (
    <MatchPairsEditor
      blockId={blockId}
      lang={lang}
      pairs={matchPairs}
      focusSlotId={selectedSlotId}
      onQuestionChange={(slotId, label) => commit(setRowLabel(draft, slotId, label))}
      onAnswerChange={(slotId, answer) => commit(setSlotAnswer(draft, slotId, answer.trim() === '' ? [] : [answer]))}
      onAdd={addQuestion}
      onRemove={removeQuestion}
    />
  );

  // REORDER AUTHORING, SIMPLE (same posture as `matchPairs` above): a
  // `reorder` block is a list of SENTENCES, not question/answer pairs — one
  // `row`+`Slot` per sentence, the full sentence stored as BOTH the slot's
  // `label` and its single `answer` (see `ReorderEditor.tsx`'s own header).
  const reorderSentences: ReorderSentence[] = isReorder
    ? questions.flatMap((question): ReorderSentence[] => {
        const slotId = rowSlotId(draft, question.id);
        const slot = slotId ? draft.slots.find((s) => s.id === slotId) : undefined;
        if (!slot || !slotId) return [];
        return [{ rowId: question.id, slotId, sentence: slot.answer[0] ?? slot.label }];
      })
    : [];

  const reorderColumn = (
    <ReorderEditor
      blockId={blockId}
      lang={lang}
      sentences={reorderSentences}
      focusSlotId={selectedSlotId}
      onSentenceChange={(slotId, sentence) => {
        const trimmed = sentence.trim();
        const withLabel = setRowLabel(draft, slotId, sentence);
        commit(setSlotAnswer(withLabel, slotId, trimmed === '' ? [] : [sentence]));
      }}
      onAdd={addQuestion}
      onRemove={removeQuestion}
    />
  );

  const questionsColumn = (
    <div className="flex flex-col gap-3">
      {hasQuestions && (
        <div data-testid={`quiz-checklist-${blockId}`} className="flex flex-col gap-1 rounded-md border border-border p-2">
          {checklist.length === 0 ? (
            <span className="flex items-center gap-1.5 text-sm text-foreground">
              <CheckCircleIcon aria-hidden="true" weight="fill" className="text-accent-ink" />
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

      {!hasQuestions ? (
        <div
          data-testid={`quiz-empty-${blockId}`}
          className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-4 text-center"
        >
          <p className="text-sm font-medium text-foreground">{t.noQuestionsYet}</p>
          <div
            data-testid={`quiz-example-preview-${blockId}`}
            className="flex w-full flex-col gap-1 rounded-md bg-muted/40 p-3 text-left text-sm text-muted-foreground"
          >
            {EXAMPLE_QUESTION_PROMPTS.map((prompt, i) => (
              <span key={prompt}>
                {i + 1}. {prompt}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" variant="primary" data-testid={`quiz-use-example-${blockId}`} onClick={useExample}>
              {t.useExample}
            </Button>
            <Button type="button" variant="outline" data-testid={`quiz-start-blank-${blockId}`} onClick={addQuestion}>
              {t.startBlank}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
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
                          // First-run tour (item 6): only the FIRST card ever anchors a tip,
                          // so a second/third question never grows its own tour.
                          wrapQuestionText={
                            index === 0
                              ? (field) => (
                                  <QuizFirstRunTip
                                    active={tips.step === 0}
                                    text={t.tip1}
                                    isLast={false}
                                    nextLabel={t.tipNext}
                                    doneLabel={t.tipDone}
                                    dismissLabel={t.tipDismiss}
                                    onNext={tips.next}
                                    onDismiss={tips.dismiss}
                                  >
                                    {field}
                                  </QuizFirstRunTip>
                                )
                              : undefined
                          }
                          wrapTypeControl={
                            index === 0
                              ? (control) => (
                                  <QuizFirstRunTip
                                    active={tips.step === 1}
                                    text={t.tip2}
                                    isLast={false}
                                    nextLabel={t.tipNext}
                                    doneLabel={t.tipDone}
                                    dismissLabel={t.tipDismiss}
                                    onNext={tips.next}
                                    onDismiss={tips.dismiss}
                                  >
                                    {control}
                                  </QuizFirstRunTip>
                                )
                              : undefined
                          }
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

          <QuizFirstRunTip
            active={tips.step === 2}
            text={t.tip3}
            isLast
            nextLabel={t.tipNext}
            doneLabel={t.tipDone}
            dismissLabel={t.tipDismiss}
            onNext={tips.next}
            onDismiss={tips.dismiss}
          >
            <button
              type="button"
              data-testid={`add-question-${blockId}`}
              onClick={addQuestion}
              className="min-h-11 w-fit rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              + {t.addQuestion}
            </button>
          </QuizFirstRunTip>
        </>
      )}
    </div>
  );

  // No preview beside/behind an empty block — item 3/8 only apply once
  // there is something to try (`QuizLivePreview` itself assumes >=1 slot
  // for its "Comprobar" score denominator).
  const previewColumn = hasQuestions ? (
    <QuizLivePreview blockId={blockId} lang={lang} payload={debouncedPayload} template={template} />
  ) : null;

  // HEIGHT CHAIN: in the editor's desktop focus layout the expanded block has
  // a fixed height and clips its overflow (BlockList). The root and the
  // two-column grid must take that height (`flex-1 min-h-0`), and each column
  // scrolls on its own — otherwise long lists are cut off with no way to reach
  // them. Phones keep normal document flow (the `lg:` scroll classes).
  if (!hasQuestions) {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col gap-3 lg:overflow-y-auto lg:[scrollbar-gutter:stable]"
        data-testid={`quiz-editor-${blockId}`}
        onKeyDownCapture={handleContainerKeyDown}
      >
        {isMatch ? matchColumn : isReorder ? reorderColumn : questionsColumn}
      </div>
    );
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3"
      data-testid={`quiz-editor-${blockId}`}
      onKeyDownCapture={handleContainerKeyDown}
    >
      {/* Mobile-only tab bar (PURE CSS: `lg:hidden`, not a JS/isDesktop branch
          — see this file's own header). Desktop shows both columns at once
          side by side and never reads `mobileTab`. */}
      <div
        role="tablist"
        aria-label={t.tabQuestions}
        data-testid={`quiz-mobile-tabs-${blockId}`}
        className="flex gap-1 rounded-md border border-border p-1 lg:hidden"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === 'questions'}
          data-testid={`quiz-tab-questions-${blockId}`}
          onClick={() => setMobileTab('questions')}
          className={cn(
            'min-h-11 flex-1 rounded px-2 text-sm font-medium',
            mobileTab === 'questions' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
          )}
        >
          {t.tabQuestions}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === 'preview'}
          data-testid={`quiz-tab-preview-${blockId}`}
          onClick={() => setMobileTab('preview')}
          className={cn(
            'min-h-11 flex-1 rounded px-2 text-sm font-medium',
            mobileTab === 'preview' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
          )}
        >
          {t.tabPreview}
        </button>
      </div>

      <div data-testid={`quiz-columns-${blockId}`} className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-2">
        <div
          data-testid={`quiz-col-questions-${blockId}`}
          className={cn(QUIZ_COLUMN_CLASS, mobileTab === 'preview' && 'max-lg:hidden')}
        >
          {isMatch ? matchColumn : isReorder ? reorderColumn : questionsColumn}
        </div>
        <div
          data-testid={`quiz-col-preview-${blockId}`}
          className={cn(QUIZ_COLUMN_CLASS, mobileTab === 'questions' && 'max-lg:hidden')}
        >
          {previewColumn}
        </div>
      </div>
    </div>
  );
}
