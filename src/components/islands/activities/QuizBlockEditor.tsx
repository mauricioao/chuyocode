/**
 * QuizBlockEditor — one `quiz` block's own editor inside the activity
 * editor's block list, mounted by `BlockList` exactly where
 * `WorksheetZoneEditor` is mounted for a `worksheet` block.
 *
 * "Varios juegos" (`template === undefined`, owner R3: "the same building
 * experience as the four templates"): a "question" here is one {@link Slot},
 * referenced by one `row` block — exactly the shape the curated
 * `/admin/ejercicios` authoring surface already uses. The STORED DATA MODEL
 * is unchanged (no migration); the authoring surface is `VariosJuegosRow.tsx`
 * — a simple Pregunta | Respuesta row per question, built from
 * `TemplateEditorKit.tsx`'s own pieces (same posture as `MatchPairsEditor.tsx`
 * and the other 3 templates), with a per-row "Agregar opciones" toggle into
 * multiple choice and a per-row "Editor avanzado" escape into the fuller old
 * {@link QuestionCard} for any shape the simple row cannot show
 * (`quizQuestionType.ts`'s own `needsAdvancedEditor`). Every mutation flows
 * through `authoringDraft.ts`'s pure setters (plus `quizQuestionType.ts`'s
 * `changeQuestionSegment` for the choice/text/gap switch), exactly as before.
 *
 * ONE ADD AFFORDANCE: the trailing "Agregar pregunta" row, or Ctrl/Cmd+Enter
 * anywhere inside the block (captured on the outer container, so it works
 * regardless of which field currently has focus).
 *
 * THE STATUS LINE (R3, "tells what the content unlocks") replaces the old
 * plain "N preguntas · todas con respuesta" — `variosJuegosStatus.ts` derives
 * WHAT to say (ready, which `GameMode`s this content already plays as, and
 * the nearest locked one) by reusing `gameModes.ts`'s own rules, never
 * re-deriving them; this file only turns that into the actual localized
 * text. While a question still blocks a submit, the CHECKLIST (owner build
 * item 5) takes its place instead — `quizChecklist.ts`'s own
 * `listIncompleteQuestions`, the same "what still blocks a submit" rules
 * `activities/blocks.ts`'s `findIncompleteSlot` enforces server-side — so
 * clicking an item scrolls/highlights the exact question it names.
 *
 * IDS ARE THIS COMPONENT'S JOB, same rule `authoringDraft.ts` documents: a
 * plain incrementing counter, seeded from the block's own id so two quiz
 * blocks minting ids in the same render never collide.
 *
 * THE EMPTY-LIST EXAMPLE ROW (owner build item 4 / R3): a brand-new block
 * shows one real, editable ghost row ("What color is the sky?" / "blue") —
 * the SAME pattern `MatchPairsEditor.tsx`'s own ghost row uses; typing into
 * either field creates the first real question right then.
 *
 * THE LIVE PREVIEW (owner build items 3 and 8) sits beside the question
 * column on desktop and behind a "Vista previa" tab on phones — a PURE CSS
 * layout (`lg:grid-cols-2` plus `max-lg:hidden` toggled by `mobileTab`), not
 * a structural `isDesktop`-branched remount: the exact same DOM renders on
 * server and client either way, so there is no hydration-flash concern and
 * no duplicate ids to reconcile, unlike a genuine two-subtree split. `payload`
 * reaches {@link QuizLivePreview} already debounced (~300ms,
 * `useDebouncedValue`) so fast typing in a row does not reset the preview's
 * own in-progress answers on every keystroke.
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
import { DotsSixVerticalIcon } from '@phosphor-icons/react/dist/ssr/DotsSixVertical';
import { ListChecksIcon } from '@phosphor-icons/react/dist/ssr/ListChecks';
import { UI_LABELS } from '@/lib/i18n';
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
import type { QuizBlock, QuizTemplate } from '@/lib/activities/blocks';
import { convertBlock, type DroppedItem } from '@/lib/activities/templateConversion';
import { variosJuegosStatus } from '@/lib/activities/variosJuegosStatus';
import type { GameMode } from '@/lib/activities/gameModes';
import ChangeMoldDialog from './ChangeMoldDialog';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';
import VariosJuegosRow from './VariosJuegosRow';
import QuizLivePreview from './QuizLivePreview';
import MatchPairsEditor, { type MatchPair } from './MatchPairsEditor';
import ReorderEditor, { type ReorderSentence } from './ReorderEditor';
import ClozeEditor, { type ClozeSentenceInput } from './ClozeEditor';
import GroupSortEditor from './GroupSortEditor';
import { isMultilinePaste } from '@/lib/activities/pasteLines';
import { parseMatchPairsPaste, type MatchPastePair } from '@/lib/activities/pasteMatchPairs';
import type { GroupSortPasteOp } from '@/lib/activities/pasteGroupSort';
import {
  applyClozeSentenceText,
  applyDistractorsText,
  deriveClozeSentences,
  deriveDistractorsText,
  removeClozeSentence,
} from '@/lib/activities/clozeSentences';
import {
  addGroupSortGroup,
  addGroupSortItems,
  deriveGroupSortRows,
  MAX_GROUPSORT_GROUPS,
  removeGroupSortGroup,
  removeGroupSortItem,
} from '@/lib/activities/groupSort';
import {
  AddRow,
  Footnote,
  SheetHeader,
  StatusNote,
  TemplateEditorLayout,
  TemplateField,
  TemplateRow,
  usePasteFeedback,
} from './TemplateEditorKit';

/** `cloze`'s own fake "selected slot id" — there is no single slot per sentence (one per blank), so the usual `onSelectSlot(slotId)` focus channel instead carries this sentence sequence number, prefixed so it never collides with a real slot id. */
const CLOZE_FOCUS_PREFIX = 'cloze-seq-';

export const COPY = {
  es: {
    addQuestion: 'Agregar pregunta',
    dragHandle: 'Reordenar pregunta',
    tabQuestions: 'Preguntas',
    tabPreview: 'Vista previa',
    previewEmpty: 'Aquí verás el juego en cuanto escribas el contenido.',
    questionsCount: (n: number) => (n === 1 ? '1 pregunta' : `${n} preguntas`),
    // "Varios juegos" own mold title/instruction, shown only here — the
    // other 4 templates already carry their own via `SheetHeader`.
    basicInstruction: 'Escribe cada pregunta con su respuesta.',
    // The empty-list EXAMPLE row (owner spec N5 follow-up, "not a dead
    // end") — same pattern as `MatchPairsEditor.tsx`'s own ghost row.
    exampleQuestion: '¿De qué color es el cielo?',
    exampleAnswer: 'azul',
    pasteHint: 'Puedes pegar una lista: una pregunta por línea, separada por = o tab.',
    pasted: (n: number) => `Se ${n === 1 ? 'agregó' : 'agregaron'} ${n === 1 ? '1 pregunta' : `${n} preguntas`}`,
    // The status line's own job (R3): say what the content UNLOCKS, not just
    // that it is submit-ready — "the point of Varios juegos".
    readyToPlay: 'Listo para jugar',
    playsAs: (modes: string) => `se juega como ${modes}`,
    unlockHint: (gap: number, mode: string) =>
      `Agrega ${gap} ${gap === 1 ? 'pregunta' : 'preguntas'} más para desbloquear ${mode}`,
    // "Cambiar de molde" (R2, decision 3 of §8): same action in every
    // quiz-based editor's own `SheetHeader`, next to its mold title.
    changeMold: 'Cambiar de molde',
    moldChanged: (name: string) => `Cambiado a ${name}`,
    moldUndoHint: 'Ctrl+Z para deshacer',
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
    dragHandle: 'Reorder question',
    tabQuestions: 'Questions',
    tabPreview: 'Preview',
    previewEmpty: 'The game shows up here as soon as you write the content.',
    questionsCount: (n: number) => (n === 1 ? '1 question' : `${n} questions`),
    basicInstruction: 'Write each question with its answer.',
    exampleQuestion: 'What color is the sky?',
    exampleAnswer: 'blue',
    pasteHint: 'You can paste a list: one question per line, separated by = or a tab.',
    pasted: (n: number) => `${n} ${n === 1 ? 'question' : 'questions'} added`,
    readyToPlay: 'Ready to play',
    playsAs: (modes: string) => `plays as ${modes}`,
    unlockHint: (gap: number, mode: string) => `Add ${gap} more ${gap === 1 ? 'question' : 'questions'} to unlock ${mode}`,
    changeMold: 'Change mold',
    moldChanged: (name: string) => `Changed to ${name}`,
    moldUndoHint: 'Ctrl+Z to undo',
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
  /**
   * "Cambiar de molde" (R2): the author chose a different mold — `payload`
   * is the converted content, `template` the block's own new mold
   * (`undefined` for "Varios juegos"). The caller (`BlockList.tsx`) commits
   * both in ONE step, so the whole conversion is one undo step upstream.
   * Optional only so every existing render site keeps compiling unchanged;
   * every real mount wires it (`BlockList.tsx`).
   */
  onConvert?: (payload: Payload, template: QuizTemplate | undefined) => void;
  /** The exact question `findIncompleteBlock` pointed back to on a rejected submit — `null`/absent otherwise. */
  incompleteSlotId?: string | null;
  incompleteMessage?: string | null;
}

/** `UI_LABELS[lang].activities.start`'s own title for a mold — the SAME name `BlockTypePicker.tsx`'s gallery and `ChangeMoldDialog.tsx` use (rule 6, §6.1: "a mold's name means the same thing everywhere"). */
function moldTitle(lang: string, template: QuizTemplate | undefined): string {
  const start = UI_LABELS[lang === 'en' ? 'en' : 'es'].activities.start;
  const key = (template ?? 'questions') as keyof typeof start;
  return (start[key] as { title: string }).title;
}

/**
 * The status line's own wording for what a conversion dropped (owner
 * follow-up on `fcbb354`'s review: "never say 'opciones' for pairs/words/
 * questions"). Each `DroppedItem.kind` gets its own noun, singular or
 * plural by its own count — never the generic "opciones" every kind used
 * to borrow.
 */
const DROPPED_NOUNS: Record<DroppedItem['kind'], { es: [string, string]; en: [string, string] }> = {
  options: { es: ['opción', 'opciones'], en: ['option', 'options'] },
  answers: { es: ['respuesta extra', 'respuestas extra'], en: ['extra answer', 'extra answers'] },
  pairs: { es: ['pareja', 'parejas'], en: ['pair', 'pairs'] },
  words: { es: ['palabra extra', 'palabras extra'], en: ['extra word', 'extra words'] },
  questions: { es: ['pregunta', 'preguntas'], en: ['question', 'questions'] },
  sentences: { es: ['oración', 'oraciones'], en: ['sentence', 'sentences'] },
  groups: { es: ['grupo', 'grupos'], en: ['group', 'groups'] },
};

/** "a, b y c" (es) / "a, b and c" (en) — every part but the last joined by a comma, the last by the conjunction. */
function joinNatural(parts: string[], lang: string): string {
  if (parts.length <= 1) return parts[0] ?? '';
  const conjunction = lang === 'en' ? 'and' : 'y';
  return `${parts.slice(0, -1).join(', ')} ${conjunction} ${parts[parts.length - 1]}`;
}

/** "se quitaron 2 opciones y 1 respuesta extra" / "2 options and 1 extra answer removed" — one clause per dropped kind, verb/count agreement on the TOTAL dropped. */
function droppedPhrase(lang: string, dropped: readonly DroppedItem[]): string {
  const localeKey = lang === 'en' ? 'en' : 'es';
  const total = dropped.reduce((sum, item) => sum + item.count, 0);
  const parts = dropped.map((item) => {
    const [singular, plural] = DROPPED_NOUNS[item.kind][localeKey];
    return `${item.count} ${item.count === 1 ? singular : plural}`;
  });
  const joined = joinNatural(parts, lang);
  return lang === 'en' ? `${joined} removed` : `${total === 1 ? 'se quitó' : 'se quitaron'} ${joined}`;
}

/**
 * `gameModes.ts`'s own {@link GameMode} -> this editor's own display name —
 * `UI_LABELS.activities.gameModes`, the SAME names `QuizGameModeSwitcher.tsx`
 * shows during practice (rule 6, §6.1: "a mold's name means the same thing
 * everywhere"). "Varios juegos"' own status line (R3) is the only other
 * place a `GameMode` needs a name, so this stays a small local lookup
 * instead of a second icon-keyed map.
 */
function gameModeName(lang: string, mode: GameMode): string {
  const g = UI_LABELS[lang === 'en' ? 'en' : 'es'].activities.gameModes;
  const names: Partial<Record<GameMode, string>> = {
    quiz: g.modeQuiz,
    cards: g.modeCards,
    match: g.modeMatch,
    reorder: g.modeReorder,
    speak: g.modeSpeak,
    wheel: g.modeWheel,
    anagram: g.modeAnagram,
    hangman: g.modeHangman,
    truefalse: g.modeTrueFalse,
    openbox: g.modeOpenBox,
    cloze: g.modeCloze,
    groupsort: g.modeGroupSort,
  };
  return names[mode] ?? mode;
}

/**
 * "Tarjetas, Une las parejas y Ruleta" (4 or fewer) / "Tarjetas, Une las
 * parejas, Ruleta y 3 más" (more) — keeps the status line one short clause
 * regardless of how many modes this content already unlocked. Reuses
 * `joinNatural` by feeding it the trailing "N más" as if it were one more
 * name — it is already the last item either way.
 */
function unlockedModesPhrase(lang: string, modes: readonly GameMode[]): string {
  const names = modes.map((mode) => gameModeName(lang, mode));
  if (names.length <= 4) return joinNatural(names, lang);
  const rest = names.length - 3;
  const more = lang === 'en' ? `${rest} more` : `${rest} más`;
  return joinNatural([...names.slice(0, 3), more], lang);
}

/**
 * "Listo para jugar · 5 preguntas · se juega como Tarjetas, Une las parejas,
 * Ruleta y 3 más" — "Varios juegos"' own status line (R3, "the status line
 * tells what the content unlocks"). Omits the "se juega como" clause while
 * nothing besides the base `quiz` mode is unlocked yet.
 */
function variosReadyLine(lang: string, t: Copy, status: { questionCount: number; unlockedModes: readonly GameMode[] }): string {
  const base = `${t.readyToPlay} · ${t.questionsCount(status.questionCount)}`;
  if (status.unlockedModes.length === 0) return base;
  return `${base} · ${t.playsAs(unlockedModesPhrase(lang, status.unlockedModes))}`;
}

/**
 * How close a locked mode needs to be before the status line bothers
 * mentioning it (R3, "when something is close, one hint") — close enough to
 * be worth typing one or two more questions for, never a standing nag for a
 * mode that is still many questions away.
 */
const UNLOCK_HINT_MAX_GAP = 2;

/** One row block's slot id — only `row` blocks are ever authored here. */
function rowSlotId(draft: Draft, rowId: string): string | null {
  const block = draft.blocks.find((b) => b.id === rowId);
  return block?.kind === 'row' ? block.slotId : null;
}

/**
 * A single row's worth of pasted content — the shared shape `insertRowsAfter`
 * takes, whether it came from a `match` pair or a `reorder` sentence.
 */
interface PasteRowSpec {
  label: string;
  answer: string[];
}

/**
 * Bulk-paste's own "fill from the focused row onward" rule (owner spec N5,
 * "paste a whole list"), shared by `match` and `reorder` (both one `row`
 * block + one plain-text `Slot` per row — `cloze`/`groupsort` have their own
 * version of this, `pasteClozeSentences`/`pasteGroupSortOps` below, since
 * their rows are not this shape). The row owning `fromSlotId` (`null` for the
 * empty-list ghost row) is REUSED for the first pasted row when it is still
 * completely empty; every other row is a brand-new `row` block, spliced right
 * after it so order is preserved — never just appended at the list's end.
 */
function insertRowsAfter(baseDraft: Draft, fromSlotId: string | null, rows: PasteRowSpec[], mint: (prefix: string) => string): Draft {
  if (rows.length === 0) return baseDraft;
  let workingDraft = baseDraft;
  let rowsToPlace = rows;
  let anchorBlockId: string | null = null;

  if (fromSlotId) {
    const anchorBlock = workingDraft.blocks.find((b) => b.kind === 'row' && b.slotId === fromSlotId);
    if (anchorBlock) {
      anchorBlockId = anchorBlock.id;
      const slot = workingDraft.slots.find((s) => s.id === fromSlotId);
      if (slot && slot.label.trim() === '' && slot.answer.length === 0) {
        const [first, ...rest] = rowsToPlace;
        workingDraft = setRowLabel(workingDraft, fromSlotId, first!.label);
        workingDraft = setSlotAnswer(workingDraft, fromSlotId, first!.answer);
        rowsToPlace = rest;
      }
    }
  }

  if (rowsToPlace.length === 0) return workingDraft;

  const newBlocks: RowBlock[] = [];
  const newSlots: Slot[] = [];
  rowsToPlace.forEach((row) => {
    const rowId = mint('row');
    const slotId = mint('slot');
    newBlocks.push({ kind: 'row', id: rowId, slotId });
    newSlots.push({ id: slotId, label: row.label, input: 'text', answer: row.answer });
  });

  const blocks = [...workingDraft.blocks];
  const spliceAt = anchorBlockId ? blocks.findIndex((b) => b.id === anchorBlockId) + 1 : blocks.length;
  blocks.splice(spliceAt, 0, ...newBlocks);

  return { ...workingDraft, blocks, slots: [...workingDraft.slots, ...newSlots] };
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
  onConvert = () => {},
  incompleteSlotId = null,
  incompleteMessage = null,
}: QuizBlockEditorProps) {
  const t = copyFor(lang);
  const isMatch = template === 'match';
  const isReorder = template === 'reorder';
  const isCloze = template === 'cloze';
  const isGroupSort = template === 'groupsort';
  const clozePoolName = `${blockId}-cloze-pool`;
  const groupSortPoolName = `${blockId}-groupsort-pool`;
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
  // "Varios juegos"' own status line (R3) — derived straight from the
  // current draft, never duplicated: `variosJuegosStatus` itself reuses
  // `gameModes.ts`'s own rules (`availableGameModes`/`nearestLockedMode`).
  const variosStatus = variosJuegosStatus(draft);

  // "Cambiar de molde" (R2): the dialog, and the status line's own transient
  // feedback — same `usePasteFeedback` mechanism the 4 template editors
  // already use for their own bulk-paste feedback (`TemplateEditorKit.tsx`):
  // it reverts on the VERY NEXT change to `payload`, except the one this
  // conversion itself just caused.
  const [moldDialogOpen, setMoldDialogOpen] = useState(false);
  const moldFeedback = usePasteFeedback(payload);

  function handleChooseMold(to: QuizTemplate | undefined) {
    const current: QuizBlock = template
      ? { id: blockId, type: 'quiz', payload, template }
      : { id: blockId, type: 'quiz', payload };
    const { block: nextBlock, dropped } = convertBlock(current, to);
    onConvert(nextBlock.payload, nextBlock.template);
    setMoldDialogOpen(false);
    const parts = [t.moldChanged(moldTitle(lang, to))];
    if (dropped.length > 0) parts.push(droppedPhrase(lang, dropped));
    parts.push(t.moldUndoHint);
    moldFeedback.show(parts.join(' · '));
  }

  const changeMoldButton = (
    <button
      type="button"
      data-testid={`change-mold-${blockId}`}
      onClick={() => setMoldDialogOpen(true)}
      className="min-h-11 shrink-0 rounded-md px-2 py-1 text-[13px] font-medium text-accent-ink hover:bg-foreground/[0.05]"
    >
      {t.changeMold}
    </button>
  );

  const moldStatusLine = moldFeedback.message ? (
    <StatusNote tone="ready" testId={`mold-status-${blockId}`}>
      {moldFeedback.message}
    </StatusNote>
  ) : null;

  const changeMoldDialog = (
    <ChangeMoldDialog
      lang={lang}
      open={moldDialogOpen}
      block={template ? { id: blockId, type: 'quiz', payload, template } : { id: blockId, type: 'quiz', payload }}
      onOpenChange={setMoldDialogOpen}
      onChoose={handleChooseMold}
    />
  );

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
    // `cloze`/`groupsort` own their rows through their own commits — a plain
    // `addQuestion` row would be an invisible stray slot in those blocks.
    if (isCloze) addClozeRow();
    else if (isGroupSort) {
      if (groupSortRows.length < MAX_GROUPSORT_GROUPS) addGroupSortRow();
    } else addQuestion();
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

  // Bulk paste (owner spec N5, "paste a whole list"): every parsed line
  // becomes one row, via the shared `insertRowsAfter` (this module's own
  // header) — ONE commit, so the whole paste is one undo step. Shared by
  // `match` and "Varios juegos" (R3) — both are one plain-text `row`+`Slot`
  // per line, the exact shape `parseMatchPairsPaste` already parses into.
  function pasteQuestionRows(fromSlotId: string | null, rows: MatchPastePair[]) {
    const rowSpecs: PasteRowSpec[] = rows.map((r) => ({ label: r.question, answer: r.answer.trim() === '' ? [] : [r.answer] }));
    commit(insertRowsAfter(draft, fromSlotId, rowSpecs, nextId));
  }

  // The empty-list example row's own first keystroke (owner spec N5
  // follow-up, "not a dead end"): adds the row AND sets `field`'s value on
  // ONE freshly-built draft, in ONE `commit` — never two separate commits
  // each reading the SAME pre-add `draft`, which would silently lose the add
  // (the second commit's `draft` closure predates the first commit's state
  // update, since React batches this handler's state updates into one).
  // Shared by `match`'s own ghost row and "Varios juegos"' own ghost row (R3).
  function addExampleQuestionRow(field: 'question' | 'answer', value: string) {
    const rowId = nextId('row');
    const slotId = nextId('slot');
    let next = addRowBlock(draft, rowId, slotId);
    next = field === 'question' ? setRowLabel(next, slotId, value) : setSlotAnswer(next, slotId, value.trim() === '' ? [] : [value]);
    commit(next);
    onSelectSlot(slotId);
  }

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
      onPastePairs={pasteQuestionRows}
      onExampleChange={addExampleQuestionRow}
      headerAction={changeMoldButton}
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

  // Bulk paste, same posture as `pasteMatchPairs` above — one sentence per
  // line, stored as both label and answer (see `reorderSentences`'s own
  // header), ONE commit.
  function pasteReorderSentences(fromSlotId: string | null, lines: string[]) {
    const rowSpecs: PasteRowSpec[] = lines.map((line) => ({ label: line, answer: line.trim() === '' ? [] : [line] }));
    commit(insertRowsAfter(draft, fromSlotId, rowSpecs, nextId));
  }

  // The empty-list example row's own first keystroke — see `addExampleQuestionRow`'s own header for the full reasoning.
  function addExampleReorderSentence(value: string) {
    const rowId = nextId('row');
    const slotId = nextId('slot');
    let next = addRowBlock(draft, rowId, slotId);
    next = setRowLabel(next, slotId, value);
    next = setSlotAnswer(next, slotId, value.trim() === '' ? [] : [value]);
    commit(next);
    onSelectSlot(slotId);
  }

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
      onPasteSentences={pasteReorderSentences}
      onExampleChange={addExampleReorderSentence}
      headerAction={changeMoldButton}
    />
  );

  // CLOZE AUTHORING ("Completar la frase", same posture as `matchPairs`/
  // `reorderSentences` above): a `cloze` block is a list of SENTENCES too,
  // but a sentence may own SEVERAL slots (one per bracketed blank — the
  // single-value `drop` mechanic cannot represent more than one gap per
  // slot, see `clozeSentences.ts`'s own header) — so its rows/slots/pool are
  // managed by that module's own pure commits rather than the generic
  // `setRowLabel`/`setSlotAnswer` pair every other template reuses.
  const clozeRows: ClozeSentenceInput[] = isCloze
    ? deriveClozeSentences(draft).map((row) => ({ seq: row.seq, text: row.text, blankCount: row.blankCount }))
    : [];
  const clozeFocusSeq =
    isCloze && selectedSlotId?.startsWith(CLOZE_FOCUS_PREFIX)
      ? Number(selectedSlotId.slice(CLOZE_FOCUS_PREFIX.length))
      : null;

  function addClozeRow() {
    const nextSeq = clozeRows.length > 0 ? Math.max(...clozeRows.map((r) => r.seq)) + 1 : 0;
    commit(applyClozeSentenceText(draft, nextSeq, '', clozePoolName, nextId));
    onSelectSlot(`${CLOZE_FOCUS_PREFIX}${nextSeq}`);
  }

  function removeClozeRow(seq: number) {
    commit(removeClozeSentence(draft, seq, clozePoolName));
    if (selectedSlotId === `${CLOZE_FOCUS_PREFIX}${seq}`) onSelectSlot(null);
  }

  // Bulk paste, same posture as `pasteMatchPairs`/`pasteReorderSentences`
  // above, but a cloze sentence is managed through `clozeSentences.ts`'s own
  // commits rather than `insertRowsAfter` (its rows/slots differ per
  // sentence, see this file's own `clozeColumn` header) — every pasted line
  // folds into ONE working draft, committed once at the end.
  function pasteClozeSentences(fromSeq: number | null, lines: string[]) {
    if (lines.length === 0) return;
    let workingDraft = draft;
    let remaining = lines;
    if (fromSeq !== null) {
      const row = deriveClozeSentences(workingDraft).find((r) => r.seq === fromSeq);
      if (row && row.text.trim() === '') {
        workingDraft = applyClozeSentenceText(workingDraft, fromSeq, remaining[0]!, clozePoolName, nextId);
        remaining = remaining.slice(1);
      }
    }
    remaining.forEach((line) => {
      const rows = deriveClozeSentences(workingDraft);
      const seq = rows.length > 0 ? Math.max(...rows.map((r) => r.seq)) + 1 : 0;
      workingDraft = applyClozeSentenceText(workingDraft, seq, line, clozePoolName, nextId);
    });
    commit(workingDraft);
  }

  // The empty-list example row's own first keystroke — `applyClozeSentenceText`
  // already takes the raw text directly, so this is naturally ONE commit
  // already (see `addExampleQuestionRow`'s own header for the full reasoning).
  function addExampleClozeSentence(value: string) {
    const nextSeq = clozeRows.length > 0 ? Math.max(...clozeRows.map((r) => r.seq)) + 1 : 0;
    commit(applyClozeSentenceText(draft, nextSeq, value, clozePoolName, nextId));
    onSelectSlot(`${CLOZE_FOCUS_PREFIX}${nextSeq}`);
  }

  const clozeColumn = (
    <ClozeEditor
      blockId={blockId}
      lang={lang}
      sentences={clozeRows}
      distractorsText={isCloze ? deriveDistractorsText(draft, clozePoolName) : ''}
      focusSeq={clozeFocusSeq}
      onSentenceChange={(seq, text) => commit(applyClozeSentenceText(draft, seq, text, clozePoolName, nextId))}
      onAdd={addClozeRow}
      onRemove={removeClozeRow}
      onDistractorsChange={(text) => commit(applyDistractorsText(draft, clozePoolName, text, nextId))}
      onPasteSentences={pasteClozeSentences}
      onExampleChange={addExampleClozeSentence}
      headerAction={changeMoldButton}
    />
  );

  // GROUPSORT AUTHORING ("Ordenar por grupos", same posture as `matchPairs`/
  // `reorderSentences`/`clozeRows` above): a `groupsort` block is a list of
  // GROUPS, each its own `row`+`group`-mechanic `Slot` (`groupSort.ts`'s own
  // pure commits) — `slot.label` is the group's name, `slot.answer` every
  // pool item id it claims from the one pool every group in this block
  // shares.
  const groupSortRows = isGroupSort ? deriveGroupSortRows(draft, groupSortPoolName) : [];

  function addGroupSortRow() {
    const rowId = nextId('row');
    const slotId = nextId('slot');
    commit(addGroupSortGroup(draft, rowId, slotId, groupSortPoolName));
    onSelectSlot(slotId);
  }

  function removeGroupSortRow(rowId: string) {
    commit(removeGroupSortGroup(draft, rowId, groupSortPoolName));
  }

  // Bulk paste (owner spec N5): `Group: item, item` creates/fills a group; a
  // line with no `:` adds its items to whichever group this SAME paste is
  // currently filling (the nearest preceding `'group'` op, or the group the
  // caret was already in when nothing precedes it — `pasteGroupSort.ts`'s own
  // header). Brand-new groups respect {@link MAX_GROUPSORT_GROUPS}; extras
  // are dropped and reported back as `overflow` for the status line. ONE
  // working draft, ONE commit.
  function pasteGroupSortOps(fromSlotId: string | null, ops: GroupSortPasteOp[]): { addedGroups: number; overflow: number } {
    type Pending = { label: string | null; items: string[] };
    const pending: Pending[] = [];
    ops.forEach((op) => {
      if (op.kind === 'group') {
        pending.push({ label: op.label, items: [...op.items] });
      } else if (pending.length > 0) {
        pending[pending.length - 1]!.items.push(...op.items);
      } else {
        pending.push({ label: null, items: [...op.items] });
      }
    });

    let workingDraft = draft;
    let remaining = pending;
    let addedGroups = 0;

    if (fromSlotId) {
      const focused = deriveGroupSortRows(workingDraft, groupSortPoolName).find((g) => g.slotId === fromSlotId);
      const first = remaining[0];
      if (focused && first && (first.label === null || (focused.label.trim() === '' && focused.items.length === 0))) {
        if (first.label !== null) workingDraft = setRowLabel(workingDraft, fromSlotId, first.label);
        if (first.items.length > 0) {
          workingDraft = addGroupSortItems(workingDraft, fromSlotId, groupSortPoolName, first.items.join(', '), nextId);
        }
        addedGroups += 1;
        remaining = remaining.slice(1);
      }
    }

    // A labelless continuation with nowhere to land (nothing preceded it in
    // this paste, and it did not merge into the focused group above) has no
    // group to join — it is simply dropped, same as an unmatched bracket
    // elsewhere in this editor.
    const toCreate = remaining.filter((p): p is { label: string; items: string[] } => p.label !== null);
    const available = Math.max(0, MAX_GROUPSORT_GROUPS - deriveGroupSortRows(workingDraft, groupSortPoolName).length);
    const created = toCreate.slice(0, available);
    const overflow = toCreate.length - created.length;

    created.forEach((group) => {
      const rowId = nextId('row');
      const slotId = nextId('slot');
      workingDraft = addGroupSortGroup(workingDraft, rowId, slotId, groupSortPoolName);
      workingDraft = setRowLabel(workingDraft, slotId, group.label);
      if (group.items.length > 0) {
        workingDraft = addGroupSortItems(workingDraft, slotId, groupSortPoolName, group.items.join(', '), nextId);
      }
    });
    addedGroups += created.length;

    commit(workingDraft);
    return { addedGroups, overflow };
  }

  // The empty-list example card's own first keystroke — see `addExampleQuestionRow`'s own header for the full reasoning.
  function addExampleGroupSortGroup(value: string) {
    const rowId = nextId('row');
    const slotId = nextId('slot');
    let next = addGroupSortGroup(draft, rowId, slotId, groupSortPoolName);
    next = setRowLabel(next, slotId, value);
    commit(next);
    onSelectSlot(slotId);
  }

  const groupSortColumn = (
    <GroupSortEditor
      blockId={blockId}
      lang={lang}
      groups={groupSortRows}
      focusSlotId={selectedSlotId}
      onLabelChange={(slotId, label) => commit(setRowLabel(draft, slotId, label))}
      onAddItems={(slotId, text) => commit(addGroupSortItems(draft, slotId, groupSortPoolName, text, nextId))}
      onRemoveItem={(slotId, itemId) => commit(removeGroupSortItem(draft, slotId, groupSortPoolName, itemId))}
      onAdd={addGroupSortRow}
      onRemove={removeGroupSortRow}
      onPasteGroups={pasteGroupSortOps}
      onExampleChange={addExampleGroupSortGroup}
      headerAction={changeMoldButton}
    />
  );

  // Bulk paste (owner spec N5 / R3): reuses `parseMatchPairsPaste` (the SAME
  // parser `match`'s own ghost row uses, per owner spec — tab/`=`/dash/`: `
  // separators) and the shared `pasteQuestionRows` commit above. `feedback`
  // reverts on the very next edit, same `usePasteFeedback` mechanism every
  // template editor's own paste feedback already uses.
  const variosPasteFeedback = usePasteFeedback(questions);
  function handleVariosPaste(fromSlotId: string | null, event: React.ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData('text');
    if (!isMultilinePaste(text)) return; // single-line paste: browser default behaviour, untouched
    event.preventDefault();
    const rows = parseMatchPairsPaste(text);
    pasteQuestionRows(fromSlotId, rows);
    variosPasteFeedback.show(t.pasted(rows.length));
  }

  const questionsColumn = (
    <div className="flex flex-col gap-3">
      {hasQuestions && (
        <div data-testid={`quiz-checklist-${blockId}`} className="flex flex-col gap-1 rounded-md border border-border p-2">
          {variosPasteFeedback.message ? (
            <StatusNote tone="ready" testId={`quiz-paste-feedback-${blockId}`}>
              {variosPasteFeedback.message}
            </StatusNote>
          ) : variosStatus.ready ? (
            <>
              <StatusNote tone="ready" testId={`quiz-unlock-status-${blockId}`}>
                {variosReadyLine(lang, t, variosStatus)}
              </StatusNote>
              {variosStatus.nearestLocked && variosStatus.nearestLocked.gap <= UNLOCK_HINT_MAX_GAP && (
                <StatusNote tone="warn" testId={`quiz-unlock-hint-${blockId}`}>
                  {t.unlockHint(variosStatus.nearestLocked.gap, gameModeName(lang, variosStatus.nearestLocked.mode))}
                </StatusNote>
              )}
            </>
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
        // The empty-list EXAMPLE row (owner spec N5 follow-up, "not a dead
        // end" / R3, "the same building experience as the four templates")
        // — exactly `MatchPairsEditor.tsx`'s own ghost row: a REAL, fully
        // editable row whose placeholders teach the format; typing into
        // either field creates the first real question right then
        // (`addExampleQuestionRow`), never a separate persisted row of its
        // own.
        <TemplateRow testId={`varios-example-${blockId}`}>
          <div className="grid grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)_2.25rem] items-center">
            <TemplateField
              aria-label={t.addQuestion}
              placeholder={t.exampleQuestion}
              data-testid={`varios-example-question-${blockId}`}
              value=""
              onChange={(event) => addExampleQuestionRow('question', event.target.value)}
              onPaste={(event) => handleVariosPaste(null, event)}
            />
            <span aria-hidden="true" className="h-7 w-px bg-foreground/[0.08]" />
            <TemplateField
              aria-label={t.addQuestion}
              placeholder={t.exampleAnswer}
              data-testid={`varios-example-answer-${blockId}`}
              value=""
              onChange={(event) => addExampleQuestionRow('answer', event.target.value)}
              onPaste={(event) => handleVariosPaste(null, event)}
            />
            <div />
          </div>
        </TemplateRow>
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
                        <VariosJuegosRow
                          slot={slot}
                          index={index + 1}
                          lang={lang}
                          poolItems={poolItems}
                          dragHandle={dragHandle}
                          highlighted={selectedSlotId === slot.id}
                          incompleteMessage={incompleteSlotId === slot.id ? incompleteMessage : null}
                          onPasteIntoRow={(event) => handleVariosPaste(slot.id, event)}
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

          <AddRow label={t.addQuestion} testId={`add-question-${blockId}`} onClick={addQuestion} />
          <Footnote testId={`quiz-paste-hint-${blockId}`}>{t.pasteHint}</Footnote>
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

  // TEMPLATE EDITORS (owner report: "no va a juego con los sombreados y
  // estilos de nuestro escritorio"): the four templates share one desk-native
  // work area — the authoring sheet beside the live preview's stage card,
  // stacked on phones (no tabs: both are short enough to scroll through) —
  // see `TemplateEditorKit.tsx`'s own header. Básico keeps the layout below.
  const templateColumn = isMatch
    ? matchColumn
    : isReorder
      ? reorderColumn
      : isCloze
        ? clozeColumn
        : isGroupSort
          ? groupSortColumn
          : null;
  if (templateColumn) {
    return (
      <>
        <TemplateEditorLayout
          blockId={blockId}
          sheet={
            <>
              {moldStatusLine}
              {templateColumn}
            </>
          }
          preview={previewColumn}
          stageLabel={t.tabPreview}
          stageEmptyText={t.previewEmpty}
          onKeyDownCapture={handleContainerKeyDown}
        />
        {changeMoldDialog}
      </>
    );
  }

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
        <SheetHeader
          icon={ListChecksIcon}
          tone="sky"
          title={moldTitle(lang, undefined)}
          instruction={t.basicInstruction}
          action={changeMoldButton}
        />
        {moldStatusLine}
        {questionsColumn}
        {changeMoldDialog}
      </div>
    );
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3"
      data-testid={`quiz-editor-${blockId}`}
      onKeyDownCapture={handleContainerKeyDown}
    >
      <SheetHeader
        icon={ListChecksIcon}
        tone="sky"
        title={moldTitle(lang, undefined)}
        instruction={t.basicInstruction}
        action={changeMoldButton}
      />
      {moldStatusLine}

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
          {questionsColumn}
        </div>
        <div
          data-testid={`quiz-col-preview-${blockId}`}
          // NO WHITE STRIP ON THE RIGHT (build item 6, owner report: "se
          // sigue viendo esa franja blanca a la derecha"): this column used
          // to reserve `lg:pr-16` so `EditorSideToolbar`'s own docked rail
          // (right-center of the window) would never sit on top of this
          // column's own "Comprobar" button — which left a visibly empty
          // gutter down the right edge. FLOATING COMPROBAR (build item 5)
          // already clears the docked rail on its own (`QuizLivePreview`'s
          // own `editorOffset`, `FLOATING_CHECK_BAR_EDITOR_OFFSET`), so this
          // column no longer needs a reserved gutter at all — it now runs
          // edge to edge like every other column, with the toolbar floating
          // OVER it instead.
          className={cn(QUIZ_COLUMN_CLASS, mobileTab === 'questions' && 'max-lg:hidden')}
        >
          {previewColumn}
        </div>
      </div>
      {changeMoldDialog}
    </div>
  );
}
