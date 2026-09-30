/**
 * AventuraIsland — the whole playable retro-RPG dialog screen for the hidden
 * Aventura prototype (`/[lang]/ingles/aventura`, never linked — see that
 * route's own header). Mounted `client:load` with `scene` as its only prop:
 * a plain data object (`Scene`), never a function — safe across the Astro
 * island serialization boundary (`src/astroIslandProps.test.ts`'s guard).
 *
 * STATE: `aventuraReducer` (`@lib/aventura/engine`, pure, unit-tested on its
 * own) owns scene progression — which line, whether its choice is answered,
 * learned grammar, visited lines, end-of-scene. This component owns only
 * UI-local state: the typewriter reveal of the CURRENT line's English text
 * (`useTypewriter`), which choice option is keyboard-focused, the two side
 * panel visibility toggles (persisted to `localStorage`, try/catch-wrapped —
 * same posture as `EditorSideToolbar`'s own persistence), and the mute
 * toggle (`useAventuraMute`).
 *
 * CONTROLS (owner brief): Enter/Space/Z advances (or finishes the typewriter
 * if it is still typing); X/Backspace goes to the previous line; clicking the
 * dialog box does the same as Enter/Space/Z; a choice menu is navigable with
 * arrows + Enter, with the classic "►" cursor; on-screen buttons cover phones
 * with no keyboard.
 *
 * "Frases aprendidas" (visited lines) is kept in component state only — never
 * sent anywhere — matching the brief's "in memory/sessionStorage only,
 * answers are never stored server-side".
 */
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { TranslateIcon } from '@phosphor-icons/react/dist/ssr/Translate';
import { BookOpenIcon } from '@phosphor-icons/react/dist/ssr/BookOpen';
import { SpeakerHighIcon } from '@phosphor-icons/react/dist/ssr/SpeakerHigh';
import { SpeakerSlashIcon } from '@phosphor-icons/react/dist/ssr/SpeakerSlash';
import { ArrowCounterClockwiseIcon } from '@phosphor-icons/react/dist/ssr/ArrowCounterClockwise';
import type { Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import SpeakButton from '@/lib/speech/SpeakButton';
import type { Scene } from '@/lib/aventura/scene';
import { aventuraReducer, initialAventuraState, progressLabel, type AventuraState } from '@/lib/aventura/engine';
import { useTypewriter } from '@/lib/aventura/useTypewriter';
import { useAventuraMute } from '@/lib/aventura/audio';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

export interface AventuraIslandProps {
  scene: Scene;
  lang: Lang;
}

interface Copy {
  translation: string;
  grammar: string;
  showTranslation: string;
  hideTranslation: string;
  showGrammar: string;
  hideGrammar: string;
  progress: (current: number, total: number) => string;
  phrasesLearned: (n: number) => string;
  mute: string;
  unmute: string;
  prev: string;
  next: string;
  choiceHint: string;
  continueHint: string;
  endTitle: string;
  endSubtitle: string;
  endNoGrammar: string;
  restart: string;
}

/** REGISTER (standing project rule): neutral Spanish, no voseo — guarded by this file's own test. */
export const COPY: Record<'es' | 'en', Copy> = {
  es: {
    translation: 'Traducción',
    grammar: 'Gramática',
    showTranslation: 'Mostrar traducción',
    hideTranslation: 'Ocultar traducción',
    showGrammar: 'Mostrar gramática',
    hideGrammar: 'Ocultar gramática',
    progress: (current, total) => `Línea ${current}/${total}`,
    phrasesLearned: (n) => (n === 1 ? '1 frase aprendida' : `${n} frases aprendidas`),
    mute: 'Silenciar sonido',
    unmute: 'Activar sonido',
    prev: 'Anterior',
    next: 'Siguiente',
    choiceHint: 'Elige una respuesta:',
    continueHint: 'Presiona Enter, Espacio o toca para continuar',
    endTitle: '¡Aventura completada!',
    endSubtitle: 'Esto es lo que aprendiste en esta escena:',
    endNoGrammar: 'Todavía no viste ningún punto de gramática.',
    restart: 'Volver a empezar',
  },
  en: {
    translation: 'Translation',
    grammar: 'Grammar',
    showTranslation: 'Show translation',
    hideTranslation: 'Hide translation',
    showGrammar: 'Show grammar',
    hideGrammar: 'Hide grammar',
    progress: (current, total) => `Line ${current}/${total}`,
    phrasesLearned: (n) => (n === 1 ? '1 phrase learned' : `${n} phrases learned`),
    mute: 'Mute sound',
    unmute: 'Unmute sound',
    prev: 'Previous',
    next: 'Next',
    choiceHint: 'Choose an answer:',
    continueHint: 'Press Enter, Space or tap to continue',
    endTitle: 'Adventure complete!',
    endSubtitle: "Here's what you learned in this scene:",
    endNoGrammar: "You haven't seen any grammar point yet.",
    restart: 'Play again',
  },
};

function copyFor(lang: Lang): Copy {
  return lang === 'es' ? COPY.es : COPY.en;
}

/** `localStorage` key for the two side-panel visibility toggles. */
export const PANEL_STORAGE_KEY = 'chuyocode:aventura-panel';

interface PanelPrefs {
  translation: boolean;
  grammar: boolean;
}

const DEFAULT_PANEL_PREFS: PanelPrefs = { translation: true, grammar: true };

function readPanelPrefs(): PanelPrefs {
  try {
    const raw = localStorage.getItem(PANEL_STORAGE_KEY);
    if (!raw) return DEFAULT_PANEL_PREFS;
    const parsed = JSON.parse(raw) as Partial<PanelPrefs>;
    return {
      translation: typeof parsed.translation === 'boolean' ? parsed.translation : DEFAULT_PANEL_PREFS.translation,
      grammar: typeof parsed.grammar === 'boolean' ? parsed.grammar : DEFAULT_PANEL_PREFS.grammar,
    };
  } catch {
    return DEFAULT_PANEL_PREFS;
  }
}

function writePanelPrefs(prefs: PanelPrefs): void {
  try {
    localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Private window / blocked storage: the toggle still works this render.
  }
}

/** A limited retro palette per backdrop — the owner's "no image assets, simple shapes" ask. */
const BACKDROP_STYLES: Record<Scene['background'], { sky: string; ground: string; accent: string }> = {
  inn: { sky: 'from-[#3b2417] to-[#1c1109]', ground: 'bg-[#5a3a22]', accent: 'bg-[#f4b942]' },
  forest: { sky: 'from-[#0f2e1d] to-[#08150d]', ground: 'bg-[#1f4a2c]', accent: 'bg-[#8fd15b]' },
  castle: { sky: 'from-[#1b2230] to-[#0a0d14]', ground: 'bg-[#3a4257]', accent: 'bg-[#c7cedb]' },
  market: { sky: 'from-[#3a1f1a] to-[#1a0c0a]', ground: 'bg-[#7a4a2a]', accent: 'bg-[#e2843d]' },
};

/** Deterministic portrait color per speaker sprite key — a generic silhouette for anything unrecognized. */
const SPRITE_COLORS: Record<string, string> = {
  narrator: 'bg-zinc-600',
  innkeeper: 'bg-amber-700',
  merchant: 'bg-violet-700',
  guard: 'bg-sky-700',
};

function SceneBackdrop({ background }: { background: Scene['background'] }) {
  const palette = BACKDROP_STYLES[background];
  return (
    <div
      aria-hidden="true"
      className={cn('absolute inset-0 bg-gradient-to-b', palette.sky)}
    >
      <div className={cn('absolute inset-x-0 bottom-0 h-1/4', palette.ground)} />
      <div className={cn('absolute top-6 left-6 h-8 w-8 rounded-sm opacity-80', palette.accent)} />
      <div className={cn('absolute top-10 right-10 h-5 w-5 rounded-sm opacity-60', palette.accent)} />
    </div>
  );
}

function SpeakerPortrait({ sprite, name }: { sprite: string | undefined; name: string }) {
  const color = (sprite && SPRITE_COLORS[sprite]) || 'bg-zinc-700';
  return (
    <div
      data-testid="speaker-portrait"
      aria-hidden="true"
      className={cn(
        'flex h-12 w-12 flex-none items-center justify-center rounded-sm border-2 border-white/80',
        color,
      )}
    >
      <span className="text-lg font-bold text-white/90">{name.charAt(0).toUpperCase()}</span>
    </div>
  );
}

/** Pixel-chrome font — declared once as a CSS var by the page's own `<link>`, with a monospace fallback. */
const PIXEL_FONT = "font-['Press_Start_2P',_ui-monospace,_monospace]";

export default function AventuraIsland({ scene, lang }: AventuraIslandProps) {
  const t = copyFor(lang);
  const reducedMotion = usePrefersReducedMotion();
  const { muted, toggleMuted, play } = useAventuraMute();

  const reducer = useCallback((s: AventuraState, a: Parameters<typeof aventuraReducer>[2]) => aventuraReducer(scene, s, a), [scene]);
  const [state, dispatch] = useReducer(reducer, scene, initialAventuraState);

  const [panelPrefs, setPanelPrefs] = useState<PanelPrefs>(DEFAULT_PANEL_PREFS);
  useEffect(() => {
    setPanelPrefs(readPanelPrefs());
  }, []);
  const togglePanel = useCallback((key: keyof PanelPrefs) => {
    setPanelPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      writePanelPrefs(next);
      return next;
    });
  }, []);

  const [focusedOption, setFocusedOption] = useState(0);

  const currentLine = scene.lines[state.index]!;
  const { displayed, done, skip } = useTypewriter(currentLine.en, { instant: reducedMotion });

  // Reset the choice cursor whenever the visible line changes.
  useEffect(() => {
    setFocusedOption(0);
  }, [state.index]);

  // One blip per revealed character (owner's optional "chiptune-ish blips" —
  // off by default via `useAventuraMute`, a no-op call otherwise).
  useEffect(() => {
    if (displayed.length > 0) play();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per length change only
  }, [displayed.length]);

  const canAdvance = state.phase === 'playing' && (!currentLine.choice || state.choiceState === 'correct');
  const choicePending =
    state.phase === 'playing' && !!currentLine.choice && state.choiceState !== 'correct';

  const advanceOrSkip = useCallback(() => {
    if (state.phase === 'end') return;
    if (choicePending) return;
    if (!done) {
      skip();
      return;
    }
    dispatch({ type: 'ADVANCE' });
  }, [state.phase, choicePending, done, skip]);

  const goBack = useCallback(() => dispatch({ type: 'BACK' }), []);

  const selectFocusedOption = useCallback(() => {
    if (!choicePending || !currentLine.choice) return;
    dispatch({ type: 'SELECT_CHOICE', optionIndex: focusedOption });
  }, [choicePending, currentLine.choice, focusedOption]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const key = e.key;

      // X/Backspace always goes back, even mid-choice — a wrong branch must
      // stay escapable, not just retryable in place.
      if (key === 'x' || key === 'X' || key === 'Backspace') {
        e.preventDefault();
        goBack();
        return;
      }

      if (choicePending && (state.choiceState === 'unanswered' || state.choiceState === 'wrong')) {
        const optionCount = currentLine.choice?.options.length ?? 0;
        if (key === 'ArrowDown') {
          e.preventDefault();
          setFocusedOption((i) => (i + 1) % optionCount);
          return;
        }
        if (key === 'ArrowUp') {
          e.preventDefault();
          setFocusedOption((i) => (i - 1 + optionCount) % optionCount);
          return;
        }
        if (key === 'Enter' || key === ' ' || key === 'z' || key === 'Z') {
          e.preventDefault();
          selectFocusedOption();
          return;
        }
        return;
      }

      if (key === 'Enter' || key === ' ' || key === 'z' || key === 'Z') {
        e.preventDefault();
        advanceOrSkip();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [choicePending, state.choiceState, currentLine.choice, selectFocusedOption, advanceOrSkip, goBack]);

  const progress = useMemo(() => progressLabel(scene, state), [scene, state]);

  if (state.phase === 'end') {
    return (
      <div
        data-testid="aventura-end-screen"
        className="relative flex aspect-[4/3] w-full flex-col items-center justify-center gap-4 overflow-hidden rounded-lg border-4 border-double border-white/80 bg-gradient-to-b from-[#1a2a52] to-[#0c1530] p-6 text-center text-white sm:p-10"
      >
        <h2 className={cn(PIXEL_FONT, 'text-lg text-accent sm:text-2xl')}>{t.endTitle}</h2>
        <p className="text-sm text-zinc-300">{t.endSubtitle}</p>
        {state.learnedGrammar.length === 0 ? (
          <p className="text-sm text-zinc-400">{t.endNoGrammar}</p>
        ) : (
          <ul className="flex max-h-64 w-full max-w-md flex-col gap-2 overflow-y-auto text-left">
            {state.learnedGrammar.map((g) => (
              <li key={g.title} className="rounded-md border border-white/20 bg-white/5 p-3">
                <p className="text-sm font-semibold text-accent">{g.title}</p>
                <p className="text-xs text-zinc-300">{g.note}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-zinc-400">{t.phrasesLearned(state.visitedLineIds.length)}</p>
        <button
          type="button"
          data-testid="aventura-restart"
          onClick={() => dispatch({ type: 'RESTART' })}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/80"
        >
          <ArrowCounterClockwiseIcon aria-hidden="true" />
          {t.restart}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* THE retro screen: 4:3-ish frame, backdrop, portrait, dialog box. */}
      <div className="relative flex-1">
        <div
          data-testid="aventura-screen"
          onClick={choicePending ? undefined : advanceOrSkip}
          className="relative flex aspect-[4/3] w-full cursor-pointer flex-col justify-end overflow-hidden rounded-lg border-4 border-double border-white/80"
        >
          <SceneBackdrop background={scene.background} />

          {/* Top chrome: progress + mute, above the backdrop. */}
          <div className="relative z-10 flex items-center justify-between p-3">
            <span className={cn(PIXEL_FONT, 'rounded bg-black/60 px-2 py-1 text-[10px] text-white')}>
              {t.progress(progress.current, progress.total)}
            </span>
            <button
              type="button"
              data-testid="aventura-mute"
              aria-label={muted ? t.unmute : t.mute}
              aria-pressed={!muted}
              onClick={(e) => {
                e.stopPropagation();
                toggleMuted();
              }}
              className="rounded-full bg-black/60 p-2 text-white transition-colors hover:bg-black/80"
            >
              {muted ? <SpeakerSlashIcon aria-hidden="true" /> : <SpeakerHighIcon aria-hidden="true" />}
            </button>
          </div>

          {/* The classic dialog window. */}
          <div className="relative z-10 m-3 rounded-lg border-4 border-double border-white bg-gradient-to-b from-[#1a2a52] to-[#0c1530] p-4 shadow-elevation-3">
            <div className="mb-2 flex items-center gap-3">
              <SpeakerPortrait sprite={currentLine.speaker.sprite} name={currentLine.speaker.name} />
              <p className={cn(PIXEL_FONT, 'text-[11px] text-accent sm:text-xs')}>{currentLine.speaker.name}</p>
            </div>
            <p data-testid="aventura-line-en" className="min-h-16 text-base text-white sm:text-lg">
              {displayed}
            </p>
            {done && canAdvance && (
              <p
                aria-hidden="true"
                className="mt-2 animate-pulse text-right text-white motion-reduce:animate-none"
              >
                ▼
              </p>
            )}
            <p className="sr-only" aria-live="polite">
              {done ? t.continueHint : ''}
            </p>
          </div>

          {choicePending && currentLine.choice && (
            <div
              data-testid="aventura-choice-menu"
              className="relative z-10 m-3 mt-0 rounded-lg border-2 border-white/70 bg-black/70 p-3"
              role="listbox"
              aria-label={currentLine.choice.question_es}
            >
              <p className="mb-2 text-xs text-zinc-300">{t.choiceHint}</p>
              <ul className="flex flex-col gap-1">
                {currentLine.choice.options.map((option, i) => (
                  <li key={option.en}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={focusedOption === i}
                      data-testid={`aventura-choice-option-${i}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setFocusedOption(i);
                        dispatch({ type: 'SELECT_CHOICE', optionIndex: i });
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm text-white transition-colors',
                        focusedOption === i ? 'bg-white/20' : 'hover:bg-white/10',
                      )}
                    >
                      <span aria-hidden="true">{focusedOption === i ? '►' : '  '}</span>
                      {option.en}
                    </button>
                  </li>
                ))}
              </ul>
              {state.choiceState === 'wrong' && state.selectedOptionIndex !== null && (
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-red-300">
                  <p data-testid="aventura-choice-feedback">
                    {currentLine.choice.options[state.selectedOptionIndex]?.feedback_es}
                  </p>
                  <button
                    type="button"
                    data-testid="aventura-choice-retry"
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: 'RETRY' });
                    }}
                    className="shrink-0 rounded-full border border-red-300/60 px-2 py-1 text-red-200 hover:bg-red-300/10"
                  >
                    {lang === 'es' ? 'Reintentar' : 'Try again'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* On-screen controls for phones — mirrors Enter/Space/Z and X/Backspace. */}
          <div className="relative z-10 flex items-center justify-between p-3">
            <button
              type="button"
              data-testid="aventura-prev"
              aria-label={t.prev}
              disabled={state.history.length === 0}
              onClick={(e) => {
                e.stopPropagation();
                goBack();
              }}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white disabled:opacity-30"
            >
              <ArrowLeftIcon aria-hidden="true" />
            </button>
            <button
              type="button"
              data-testid="aventura-next"
              aria-label={t.next}
              disabled={choicePending}
              onClick={(e) => {
                e.stopPropagation();
                advanceOrSkip();
              }}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white disabled:opacity-30"
            >
              <ArrowRightIcon aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Side panel: translation + grammar, each toggleable and persisted. */}
      <aside className="flex w-full flex-col gap-3 lg:w-80" aria-label={t.translation}>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <TranslateIcon aria-hidden="true" /> {t.translation}
            </h3>
            <div className="flex items-center gap-1">
              <SpeakButton text={currentLine.en} lang={lang} />
              <button
                type="button"
                data-testid="aventura-toggle-translation"
                aria-label={panelPrefs.translation ? t.hideTranslation : t.showTranslation}
                aria-pressed={panelPrefs.translation}
                onClick={() => togglePanel('translation')}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <TranslateIcon aria-hidden="true" />
              </button>
            </div>
          </div>
          {panelPrefs.translation && (
            <p data-testid="aventura-translation-text" className="text-sm text-zinc-300">
              {currentLine.es}
            </p>
          )}
        </div>

        {currentLine.grammar && (
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <BookOpenIcon aria-hidden="true" /> {t.grammar}
              </h3>
              <button
                type="button"
                data-testid="aventura-toggle-grammar"
                aria-label={panelPrefs.grammar ? t.hideGrammar : t.showGrammar}
                aria-pressed={panelPrefs.grammar}
                onClick={() => togglePanel('grammar')}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <BookOpenIcon aria-hidden="true" />
              </button>
            </div>
            {panelPrefs.grammar && (
              <div data-testid="aventura-grammar-text">
                <p className="text-sm font-semibold text-accent">{currentLine.grammar.title}</p>
                <p className="text-xs text-zinc-300">{currentLine.grammar.note}</p>
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-zinc-500">{t.phrasesLearned(state.visitedLineIds.length)}</p>
      </aside>
    </div>
  );
}
