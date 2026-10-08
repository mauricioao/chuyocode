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
 * never fires from anything in this file). It resets whenever the question
 * SET changes shape (a question added/removed — `structuralKey` below), so a
 * stale answer never sits against a question that no longer matches it; it
 * deliberately does NOT reset on every keystroke edit to an existing
 * question's text, since `payload` itself already arrives pre-debounced from
 * `QuizBlockEditor`.
 */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { QuizBlock } from '@/lib/activities/blocks';
import { check, type GradeResult } from '@/lib/exerciseGrading';
import type { Lang } from '@/lib/i18n';
import type { ExerciseResponse, Payload } from '@/lib/exercisePayload';
import { availableGameModes, deriveGameItems, SELF_CHECKING_GAME_MODES, type GameMode } from '@/lib/activities/gameModes';
import QuizBlockPractice from './QuizBlockPractice';
import { GAME_MODE_ICONS } from './QuizGameModeSwitcher';

export const COPY = {
  es: {
    usedInGames: (n: number) => (n === 1 ? 'Estas preguntas se usan en 1 juego' : `Estas preguntas se usan en ${n} juegos`),
    check: 'Comprobar',
    retry: 'Reintentar',
    score: 'Puntaje',
  },
  en: {
    usedInGames: (n: number) => (n === 1 ? 'These questions are used in 1 game' : `These questions are used in ${n} games`),
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
}

/** The question set's own shape — same slot ids, in the same order. Changes only when a question is added, removed, or reordered, never on a plain text/option edit. */
function structuralKey(payload: Payload): string {
  return payload.slots.map((slot) => slot.id).join('|');
}

export default function QuizLivePreview({ blockId, lang, payload }: QuizLivePreviewProps) {
  const t = copyFor(lang);
  const [mode, setMode] = useState<GameMode>('quiz');
  const [response, setResponse] = useState<ExerciseResponse>({});
  const [result, setResult] = useState<GradeResult | undefined>(undefined);

  const key = structuralKey(payload);
  const prevKeyRef = useRef(key);
  useEffect(() => {
    if (prevKeyRef.current === key) return;
    prevKeyRef.current = key;
    setResponse({});
    setResult(undefined);
  }, [key]);

  const gameItems = deriveGameItems(payload);
  const modes = availableGameModes(gameItems, payload);

  const block: QuizBlock = { id: `${blockId}-preview`, type: 'quiz', payload };

  return (
    <div data-testid={`quiz-preview-${blockId}`} className="flex flex-col gap-3">
      <div data-testid={`quiz-preview-games-badge-${blockId}`} className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <span>{t.usedInGames(modes.length)}</span>
        {modes.map((m) => {
          const Icon = GAME_MODE_ICONS[m];
          return Icon ? <Icon key={m} aria-hidden="true" /> : null;
        })}
      </div>

      <QuizBlockPractice
        lang={lang as Lang}
        block={block}
        response={response}
        onChange={(slotId, value) => setResponse((r) => ({ ...r, [slotId]: value }))}
        outcomes={result?.slots}
        disabled={false}
        mode={mode}
        onModeChange={setMode}
      />

      {/* ONE "COMPROBAR" (build item 2): a self-checking game (today:
          `match`) already shows its own board-level Comprobar — this
          editor-only preview must not add a second one right under it,
          same rule `ActivityPracticeIsland`'s own footer follows. */}
      {!SELF_CHECKING_GAME_MODES.has(mode) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
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
  );
}
