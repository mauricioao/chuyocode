/**
 * CheckMark — the small ✓/✕ badge every GRADED chip shows across the four
 * big-stage drag templates (`QuizMatching`/`QuizReorder`/`QuizCloze`/
 * `QuizGroupSort`), so "correct"/"wrong" is never colour alone (UX audit
 * F10, UX-INGLES.md §6.3 "Al comprobar"). Built once, imported by all four,
 * same reasoning `mechanics/chip.ts`'s own header gives for the shared chip
 * shape itself: one recipe instead of four near-identical ones that drift
 * apart the moment an edit touches only one.
 *
 * ADDITIVE ONLY. This file never touches a chip's own colour, background,
 * border, size or radius — every one of those stays exactly `chip.ts`'s own
 * `locked`/`wrong` styling, untouched. The mark is purely ON TOP of it.
 *
 * ABSOLUTE, PINNED TO THE TOP-RIGHT CORNER, OVERLAPPING THE EDGE — never in
 * flow, so it causes zero layout shift and never changes the chip's own
 * footprint. `QuizOpenBox.tsx`'s own "opened" checkmark overlay already
 * proves this exact recipe (`absolute -right-* -top-* size-* rounded-full
 * bg-success-strong ... text-white`) elsewhere in this codebase; this module
 * is that same idea, sized for the bigger "readable from the back of the
 * room" stage tiles instead of a 44px open-box square. The caller's own chip
 * element must carry `relative` for this to anchor correctly — never added
 * here, since this component does not own the chip's own class list.
 *
 * DARK success/error FILL, WHITE GLYPH (`DIRECCION-VISUAL.md` §3: "todo
 * botón con texto blanco usa la versión oscura" — white text needs the DARK
 * variant, never the pale one). Reusing the SAME `success-strong`/
 * `destructive` tokens each chip's own `locked`/`wrong` colour already pulls
 * from — never a new palette. Both already resolve to a dark, white-safe
 * value inside the Inglés product scope these four templates render in
 * (`tailwind-tokens.test.ts`/`ingles-theme-contrast.test.ts` guard the exact
 * values): `--success-strong: #1b7340` and `--destructive: #c8371f`, each
 * ≥ 4.5:1 against white.
 */
import { CheckIcon } from '@phosphor-icons/react/dist/ssr/Check';
import { XIcon } from '@phosphor-icons/react/dist/ssr/X';
import { cn } from '@/lib/utils';

export type GradeState = 'correct' | 'wrong';

/** One graded piece's own ✓/✕ badge. `aria-hidden`: the accessible name carries the "correct"/"wrong" meaning on its own (see {@link gradeAriaSuffix}), never duplicated here. */
export function GradeMark({ state }: { state: GradeState }) {
  const Icon = state === 'correct' ? CheckIcon : XIcon;
  return (
    <Icon
      aria-hidden="true"
      weight="bold"
      data-testid={`grade-mark-${state}`}
      className={cn(
        'pointer-events-none absolute -top-1.5 -right-1.5 size-5 rounded-full p-1 text-white shadow-elevation-1',
        state === 'correct' ? 'bg-success-strong' : 'bg-destructive',
        // `motion-safe:`, never a `reducedMotion` prop threaded in from four
        // call sites: the badge mounts on an ALREADY-settled chip (the
        // colour/border transition is each chip's own, untouched concern),
        // so its own entrance is a short, independent fade + scale — gone
        // entirely, never a flash, under reduced motion.
        'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-50 duration-150',
      )}
    />
  );
}

const GRADE_WORD: Record<'es' | 'en', Record<GradeState, string>> = {
  es: { correct: 'correcta', wrong: 'incorrecta' },
  en: { correct: 'correct', wrong: 'incorrect' },
};

/**
 * Appended to an already-built accessible name.
 *
 * Every graded chip across the four templates is ALSO a "remove this tile"
 * button, so its accessible name is an explicit `aria-label` — which
 * overrides every child, including a sibling visually-hidden `<span>`. The
 * only way to add "correcta"/"incorrecta" to that name without silently
 * losing it is to fold it into that SAME string at the call site, never a
 * child span an `aria-label` would swallow. Returns `''` (no suffix) once
 * nothing has been graded, so an ungraded tile's name is unchanged.
 */
export function gradeAriaSuffix(lang: 'es' | 'en', state: GradeState | undefined): string {
  return state ? ` ${GRADE_WORD[lang][state]}` : '';
}

/**
 * "2 correctas, 1 incorrecta" / "2 correct, 1 incorrect" — the one polite
 * live-region sentence a template announces after "Comprobar" grades some
 * pieces. Correct comes first, then wrong; a zero count is OMITTED rather
 * than read out ("0 incorrectas" says nothing useful). `null` once nothing
 * has been graded (before the first check, or right after a reset) — the
 * caller clears its own live region on that, rather than printing an empty
 * sentence.
 */
export function gradeSummary(lang: 'es' | 'en', correct: number, wrong: number): string | null {
  if (correct <= 0 && wrong <= 0) return null;
  const parts: string[] = [];
  if (correct > 0) parts.push(countPhrase(lang, correct, 'correct'));
  if (wrong > 0) parts.push(countPhrase(lang, wrong, 'wrong'));
  return parts.join(', ');
}

/** Spanish pluralises the WORD ("correcta" -> "correctas"); English pluralises neither ("1 correct"/"2 correct" — the adjective never changes). */
function countPhrase(lang: 'es' | 'en', count: number, state: GradeState): string {
  const word = lang === 'es' && count !== 1 ? `${GRADE_WORD.es[state]}s` : GRADE_WORD[lang][state];
  return `${count} ${word}`;
}
