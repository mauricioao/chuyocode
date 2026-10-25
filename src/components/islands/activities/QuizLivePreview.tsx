/**
 * QuizLivePreview — the author-facing "try it as a learner would" panel
 * beside (desktop) or behind a tab from (phone) the question card list
 * (owner build items 3 and 8, "live, playable preview"). Renders the REAL
 * `QuizBlockPractice` + `QuizGameModeSwitcher` against the current draft, so
 * trying Tarjetas/Ruleta/etc. here is exactly what a learner would see — no
 * second, simplified preview renderer to keep in sync with the real one.
 *
 * OWNS A SMALL AMOUNT OF LOCAL STATE, deliberately NOT lifted to
 * `QuizBlockEditor`: the learner-facing `response`/`mode`/grading the author
 * tries here must never leak into the AUTHORED payload (`onPayloadChange`
 * never fires from anything in this file). `response`/`result` reset
 * whenever the question SET changes shape (a question added/removed —
 * `structuralKey` below), so a stale answer never sits against a question
 * that no longer matches it; they deliberately do NOT reset on every
 * keystroke edit to an existing question's text, since `payload` itself
 * already arrives pre-debounced from `QuizBlockEditor`.
 *
 * `mode` IS NOT CACHED (T1 bugfix, "molded previews show the real board,
 * never the generic Básico layout"): it used to be `useState(() =>
 * initialGameMode(...))`, re-derived only when `structuralKey` changed —
 * but typing into an EXISTING sentence/pair, or adding items to an EXISTING
 * group, never changes that key, so the cached mode stayed stuck at
 * whatever it was on the very FIRST render even once the board's own
 * content became eligible (owner report: typing fast enough hid it behind
 * the 300ms debounce, but pausing after the first word surfaced it). `mode`
 * is now a plain derivation every render — `chosenMode ?? initialGameMode(
 * ...)` — so it always reflects the CURRENT payload; only the Básico
 * multi-mode switcher (template === undefined) ever sets `chosenMode`, via
 * `onModeChange`, same as before.
 */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { BlockBackground, QuizBlock, QuizTemplate } from '@/lib/activities/blocks';
import { check, type GradeResult } from '@/lib/exerciseGrading';
import type { Lang } from '@/lib/i18n';
import type { ExerciseResponse, Payload } from '@/lib/exercisePayload';
import {
  boardHasContent,
  deriveGameItems,
  initialGameMode,
  SELF_CHECKING_GAME_MODES,
  type GameMode,
} from '@/lib/activities/gameModes';
import { FLOATING_CHECK_BAR_CLASS, STAGE_BOTTOM_RESERVE_CLASS, STAGE_CONTAINER_SIZE } from '@/components/islands/mechanics/scale';
import { cn } from '@/lib/utils';
import ActivityPreviewFrame from './ActivityPreviewFrame';
import QuizBlockPractice from './QuizBlockPractice';

const COPY = {
  es: {
    previewTitle: 'Vista previa',
    check: 'Comprobar',
    retry: 'Reintentar',
    score: 'Puntaje',
  },
  en: {
    previewTitle: 'Preview',
    check: 'Check',
    retry: 'Try again',
    score: 'Score',
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

function copyFor(lang: string): Copy {
  return lang === 'en' ? COPY.en : COPY.es;
}

export interface QuizLivePreviewProps {
  blockId: string;
  lang: string;
  /** Already debounced by the caller (`QuizBlockEditor`) — this component re-derives nothing to smooth out typing itself. */
  payload: Payload;
  /** The block's own authoring preset (`blocks.ts`'s `QuizTemplate`) — this preview must open in the TEMPLATE's own game (`match`/`reorder`), not always "Básico". `undefined` keeps the previous "Básico" default. */
  template?: QuizTemplate;
  /** The block's own decorative background (plantillas: fondo, `blocks.ts`'s own `BlockBackground`) — painted by the inner `ActivityStage` via `ActivityPreviewFrame`. `undefined` keeps its plain grey canvas. */
  background?: BlockBackground;
  /**
   * The REAL activity title and level, exactly as the student's own window
   * shows them (`[id].astro`'s own `levelChip`) — owner audit §c: this
   * preview is "try it as a learner would", so its own chrome should read
   * like the window it actually sits inside, not a placeholder. Falls back
   * to the placeholder "Vista previa"/"Preview" copy only while
   * `activityTitle` is empty/omitted (a brand-new, untitled activity).
   */
  activityTitle?: string;
  activityLevelChip?: string | null;
}

/** The question set's own shape — same slot ids, in the same order. Changes only when a question is added, removed, or reordered, never on a plain text/option edit. */
function structuralKey(payload: Payload): string {
  return payload.slots.map((slot) => slot.id).join('|');
}

export default function QuizLivePreview({
  blockId,
  lang,
  payload,
  template,
  background,
  activityTitle,
  activityLevelChip,
}: QuizLivePreviewProps) {
  const t = copyFor(lang);
  const gameItems = deriveGameItems(payload);
  // Only the Básico multi-mode switcher below ever calls `onModeChange` —
  // everywhere else `mode` (right below) is simply DERIVED from the current
  // content every render, never cached (this file's own header, T1 bugfix).
  const [chosenMode, setChosenMode] = useState<GameMode | null>(null);
  const mode = chosenMode ?? initialGameMode(template, gameItems, payload);
  const [response, setResponse] = useState<ExerciseResponse>({});
  const [result, setResult] = useState<GradeResult | undefined>(undefined);

  const key = structuralKey(payload);
  const prevKeyRef = useRef(key);
  useEffect(() => {
    if (prevKeyRef.current === key) return;
    prevKeyRef.current = key;
    setResponse({});
    setResult(undefined);
    setChosenMode(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, template]);

  const block: QuizBlock = { id: `${blockId}-preview`, type: 'quiz', payload, ...(template ? { template } : {}) };
  const frameTitle = activityTitle && activityTitle.trim() !== '' ? activityTitle : t.previewTitle;

  // NEVER THE GENERIC BÁSICO LAYOUT FOR A MOLDED BLOCK (T1 decision,
  // "molded activity previews show the real board, never Básico"): a
  // template plays ONLY its own game — once its own board has nothing to
  // show yet ({@link boardHasContent}), this preview shows NOTHING rather
  // than falling back to Básico. The caller decides what to show instead:
  // `QuizBlockEditor`'s own template stage keeps its placeholder text (its
  // `previewHasContent` reads the exact same `boardHasContent` call before
  // even mounting this component); the whole-activity eye-button preview
  // (`ActivityEditorIsland.tsx`) simply renders nothing for this block.
  // After ALL hooks above, so a board that gains its first bit of content
  // never changes this component's own hook count between renders.
  if (template && !boardHasContent(template, gameItems, payload)) return null;

  return (
    <ActivityPreviewFrame title={frameTitle} levelChip={activityLevelChip} background={background}>
      <div
        data-testid={`quiz-preview-${blockId}`}
        // Owner bug (result screen squeezed into a short band at the top of
        // the frame): `ActivityStage` (tonight's `contain: layout` pass)
        // only stretches a flex child that itself opts into `min-h-0
        // flex-1` — this column used to be a plain `flex flex-col`, so it
        // sized to its own CONTENT height instead of the stage's, and
        // `GameResult` (down inside a self-checking mold) collapsed with
        // it. `pb-3` matches the 12px bottom gap the real player's own
        // stage wrapper reserves (`ActivityPracticeIsland.tsx`'s `p-3`),
        // which `GameResult`'s own `-mb-3` crop-line bleed assumes; the
        // bigger `STAGE_BOTTOM_RESERVE_CLASS` gap OVERRIDES just the bottom
        // (listed after `p-3`, so `tailwind-merge` keeps the later one for
        // that one side) only while THIS preview's own floating Comprobar
        // below can render — a self-checking mold (match/reorder/cloze/
        // groupsort) shows its own instead, same condition
        // `ActivityPracticeIsland`'s own `showCombinedFooter` already uses
        // for the real player. `STAGE_CONTAINER_SIZE` (both `cqw` AND
        // `cqh`), not the old width-only `STAGE_CONTAINER`: this column is
        // now bounded by `ActivityPreviewFrame`'s own fixed 1240x748
        // viewport (`scale.ts`'s own header on why that makes full size
        // containment safe here).
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-3 p-3',
          STAGE_CONTAINER_SIZE,
          !SELF_CHECKING_GAME_MODES.has(mode) && STAGE_BOTTOM_RESERVE_CLASS,
        )}
      >
        <QuizBlockPractice
          lang={lang as Lang}
          block={block}
          response={response}
          onChange={(slotId, value) => setResponse((r) => ({ ...r, [slotId]: value }))}
          outcomes={result?.slots}
          disabled={false}
          mode={mode}
          onModeChange={setChosenMode}
          // Preview-only, deliberately non-empty (owner audit §c): makes a
          // self-checking mold's own `GameResult` render "Otra actividad" —
          // inert via `ActivityPreviewContext` (`ActivityPreviewFrame.tsx`),
          // never a real navigation — the same chrome the student sees,
          // instead of only ever falling back to "Jugar de nuevo" here.
          nextHref="#"
        />

        {/* ONE "COMPROBAR" (build item 2): a self-checking game (today:
            `match`) already shows its own FLOATING board-level Comprobar —
            this editor-only preview must not add a second one, same rule
            `ActivityPracticeIsland`'s own footer follows. FLOATING COMPROBAR
            (build item 5): same bottom-right spot — `ActivityPreviewFrame`'s
            own `ActivityStage` is now this bar's containing block (owner
            audit §c), so it no longer needs to dodge the editor's side
            toolbar, which sits OUTSIDE this scaled frame entirely — see
            `scale.ts`'s own `FLOATING_CHECK_BAR_CLASS` header. */}
        {!SELF_CHECKING_GAME_MODES.has(mode) && (
          <div data-testid={`quiz-preview-actions-${blockId}`} className={FLOATING_CHECK_BAR_CLASS}>
            <Button
              type="button"
              size="sm"
              data-testid={`quiz-preview-check-${blockId}`}
              onClick={() => setResult(check(payload, response))}
            >
              {t.check}
            </Button>
            {result && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid={`quiz-preview-retry-${blockId}`}
                  onClick={() => {
                    setResponse({});
                    setResult(undefined);
                  }}
                >
                  {t.retry}
                </Button>
                <span data-testid={`quiz-preview-score-${blockId}`} className="text-sm text-muted-foreground">
                  {t.score}: {Object.values(result.slots).filter((o) => o === 'correct').length} / {payload.slots.length}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </ActivityPreviewFrame>
  );
}
