import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * GameResult's Vanina entrance + confetti burst — CSS-only behaviour jsdom
 * cannot observe (no external stylesheet cascade, no real animations), so
 * this reads the actual shipped `global.css` and asserts on its source,
 * same pattern `shadow-utilities.test.ts`/`pair-row-columns.test.ts` use.
 *
 * Two bugfixes (owner reports):
 * 1. "Vanina aparece de golpe" — her entrance used to play unconditionally
 *    on mount, finishing before the pose image was even paintable. Now
 *    gated on `data-ready="true"` (`GameResult.tsx` sets it once the `<img>`
 *    has decoded or errored, or a fallback delay elapsed).
 * 2. "Las chispas (confetti) no aparecen para nada" — `prefers-reduced-
 *    motion: reduce` used to hide the WHOLE confetti layer outright
 *    (`display: none`), so a visitor with OS animations off saw nothing at
 *    all; and the burst was a single eased slide, never a two-phase
 *    explosion-then-fall.
 */
const stylesDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(stylesDir, 'global.css'), 'utf8');

// Scoped to GameResult's own CSS section — the file has OTHER rules with the
// same prelude (e.g. an earlier, unrelated `@media (prefers-reduced-motion:
// no-preference)` for `.template-enter`), so searching the whole file would
// find the wrong occurrence.
const sectionStart = source.indexOf('.game-result-vanina {');
const sectionEnd = source.indexOf("--- Smart header/footer", sectionStart);
if (sectionStart === -1 || sectionEnd === -1) {
  throw new Error('GameResult CSS section not found in global.css — has it moved or been renamed?');
}
const section = source.slice(sectionStart, sectionEnd);

/**
 * Body (braces included) of the first rule/block whose prelude is exactly
 * `prelude`, scoped to {@link section}. Brace-balanced, so it correctly
 * captures a multi-stop `@keyframes` or a `@media` nested inside an
 * `@supports` (or vice versa), not just up to the first `}`.
 *
 * `searchFrom` disambiguates a prelude that occurs MORE THAN ONCE in the
 * section — Vanina and the confetti layer each have their own `@media
 * (prefers-reduced-motion: …)` block — by starting the search after a
 * given anchor instead of at the top.
 */
function rule(prelude: string, searchFrom = 0): string {
  const start = section.indexOf(`${prelude} {`, searchFrom);
  if (start === -1) throw new Error(`not found in the GameResult CSS section (from offset ${searchFrom}): ${prelude}`);
  let depth = 0;
  let i = section.indexOf('{', start);
  const bodyStart = i;
  do {
    if (section[i] === '{') depth += 1;
    else if (section[i] === '}') depth -= 1;
    i += 1;
  } while (depth > 0 && i < section.length);
  return section.slice(bodyStart, i);
}

const block = rule;

/** Offset of the confetti sub-section (after Vanina's own rules) — pass as `searchFrom` to reach the CONFETTI occurrence of a prelude shared with Vanina's own rules above it. */
const confettiSectionStart = (() => {
  const i = section.indexOf('.game-result-confetti {');
  if (i === -1) throw new Error('.game-result-confetti rule not found in the GameResult CSS section');
  return i;
})();

describe('Vanina pop-in gated on data-ready (bugfix: "aparece de golpe")', () => {
  it('rests invisible, below the window edge, unconditionally — the pre-animation state', () => {
    const body = rule('.game-result-vanina');
    expect(body).toContain('opacity: 0;');
    // 160% used to be a literal — now 110 points past the per-pose resting
    // position (`--vanina-rest-y`, see the "abdomen up sizing" describe
    // below), so the same "start further down, rise up" distance survives
    // the move to a dynamic, per-pose crop line.
    expect(body).toMatch(/transform:\s*translateY\(calc\(var\(--vanina-rest-y\)\s*\+\s*110%\)\)\s*scale\(0\.85\)/);
  });

  it('only plays the entrance once data-ready="true", under normal motion', () => {
    const noPreference = block('@media (prefers-reduced-motion: no-preference)');
    expect(noPreference).toContain(".game-result-vanina[data-ready='true']");
    expect(noPreference).toMatch(/animation:\s*game-result-vanina-pop/);
  });

  it('never plays the entrance unconditionally anymore (old bug: finished before the image could paint)', () => {
    // The bare (un-gated) selector must no longer carry the animation itself.
    const bareRule = rule('.game-result-vanina');
    expect(bareRule).not.toMatch(/animation:\s*game-result-vanina-pop/);
  });

  it('keeps a cubic-bezier fallback for browsers without linear() easing support', () => {
    const fallback = block('@supports not (animation-timing-function: linear(0, 1))');
    expect(fallback).toContain(".game-result-vanina[data-ready='true']");
    expect(fallback).toMatch(/animation:\s*game-result-vanina-pop\s*700ms\s*cubic-bezier\(0\.34,\s*1\.56,\s*0\.64,\s*1\)/);
  });

  it('uses a linear() spring easing as the primary curve', () => {
    const noPreference = block('@media (prefers-reduced-motion: no-preference)');
    expect(noPreference).toMatch(/\.game-result-vanina\[data-ready='true'\][^}]*linear\(/s);
  });

  it('fades in (no slide) under reduced motion, only once data-ready', () => {
    const reduce = block('@media (prefers-reduced-motion: reduce)');
    expect(reduce).toContain('.game-result-vanina');
    // Snaps straight to the per-pose resting crop line (`--vanina-rest-y`) —
    // the literal `50%` this used to read is gone now that the crop line
    // moves per pose; see the "abdomen up sizing" describe below.
    expect(reduce).toMatch(/\.game-result-vanina\s*\{[^}]*transform:\s*translateY\(var\(--vanina-rest-y\)\)/s);
    expect(reduce).toMatch(/\.game-result-vanina\[data-ready='true'\]\s*\{[^}]*opacity:\s*1/s);
    // Never the full slide-up distance under reduced motion.
    expect(reduce).not.toMatch(/\.game-result-vanina[^{]*\{[^}]*translateY\(calc\(var\(--vanina-rest-y\)\s*\+\s*110%\)\)/s);
  });
});

describe('"equal head size" sizing (owner follow-up bugfix: same apparent HEAD size for every outcome — the old "abdomen up" formula inflated pulgar-arriba\'s whole image, head included, since its own abdomen is an extrapolated guess with no real feature behind it)', () => {
  it('derives the box height from the target head height and this pose\'s own head/chin fractions', () => {
    const body = rule('.game-result-vanina');
    expect(body).toMatch(/height:\s*calc\(var\(--vanina-head\)\s*\/\s*\(var\(--pose-chin\)\s*-\s*var\(--pose-head\)\)\)/);
  });

  it('derives the resting translateY from the abdomen line clamped to the image\'s own bottom edge, as a percentage of the element\'s own height', () => {
    const body = rule('.game-result-vanina');
    // `--vanina-abdomen-line` is `min(--pose-abdomen, 1)` — the defensive
    // clamp backstopping the registry's own "abdomen is always <= 1"
    // invariant (`characterPoses.ts`'s own `RESULT_POSE_FRAMING`).
    expect(body).toMatch(/--vanina-abdomen-line:\s*min\(var\(--pose-abdomen\),\s*1\)/);
    expect(body).toMatch(/--vanina-rest-y:\s*calc\(\(1\s*-\s*var\(--vanina-abdomen-line\)\)\s*\*\s*100%\)/);
  });

  it('gives --pose-head/--pose-chin/--pose-abdomen a safe fallback so an un-wired caller never divides by zero', () => {
    const body = rule('.game-result-vanina');
    expect(body).toMatch(/--pose-head:\s*0;/);
    expect(body).toMatch(/--pose-chin:\s*0\.5;/);
    expect(body).toMatch(/--pose-abdomen:\s*1;/);
  });

  it('grows the target head height at tablet (md) and desktop (lg), same formula, just a taller target', () => {
    expect(section).toMatch(/@media \(min-width:\s*768px\)\s*\{\s*\.game-result-vanina\s*\{\s*--vanina-head:\s*4\.15rem;/);
    expect(section).toMatch(/@media \(min-width:\s*1024px\)\s*\{\s*\.game-result-vanina\s*\{\s*--vanina-head:\s*5\.19rem;/);
  });

  // Bugfix (owner report, `vanina-v3/perfect-390x844.png`): ~47px
  // (`2.94rem`) read far too small on a phone — the old value, carried over
  // unchanged from before this sizing formula existed. 4.375rem = 70px,
  // picked for on-screen readability; verified by real rendering
  // (`vanina-clearance.js`, scratchpad) that her TOP edge still clears every
  // outcome's own lowest text/button by >=16px at both 360x800 and 390x844
  // — see this task's own final report for the measured numbers. Tablet
  // (md) and desktop (lg) are untouched above.
  it('grows the phone target head height too (owner report: ~47px read too small) — 70px, the largest that still clears every outcome\'s own content with room to spare', () => {
    expect(section).toMatch(/\.game-result-vanina\s*\{[^}]*--vanina-head:\s*4\.375rem;/s);
  });
});

describe('confetti burst: two phases (explosion then slow fall), gated with Vanina', () => {
  it('gates the piece animation behind the SAME data-ready flag as Vanina, scoped to the confetti layer', () => {
    const noPreference = block('@media (prefers-reduced-motion: no-preference)', confettiSectionStart);
    expect(noPreference).toContain(".game-result-confetti[data-ready='true'] .game-result-confetti-piece");
  });

  it('declares two distinct easings in the one piece keyframe: explosive overshoot, then gravity ease-in', () => {
    const keyframe = rule('@keyframes game-result-confetti-piece');
    // Phase 1 override, declared at the 0% stop.
    expect(keyframe).toMatch(/0%\s*\{[^}]*animation-timing-function:\s*cubic-bezier\(0\.17,\s*0\.89,\s*0\.32,\s*1\.25\)/s);
    // Phase 2 (12% -> 100%) relies on the base/default easing — no second override.
    const from12Percent = keyframe.slice(keyframe.indexOf('12%'));
    expect(from12Percent).not.toContain('animation-timing-function');
  });

  it('carries a sway waypoint and a fall waypoint distinct from the burst peak (--confetti-dx/dy)', () => {
    const keyframe = rule('@keyframes game-result-confetti-piece');
    expect(keyframe).toContain('--confetti-sway-dx');
    expect(keyframe).toContain('--confetti-sway-dy');
    expect(keyframe).toContain('--confetti-fall-dx');
    expect(keyframe).toContain('--confetti-fall-dy');
  });

  it('only fades out near the very end (88% -> 100%), never across the whole timeline', () => {
    const keyframe = rule('@keyframes game-result-confetti-piece');
    expect(keyframe).toMatch(/88%\s*\{\s*opacity:\s*1;/);
    expect(keyframe).toMatch(/100%\s*\{[^}]*opacity:\s*0/s);
  });

  it('gives each piece an inner paper-flutter element, independent of the outer motion but bounded to a finite number of iterations', () => {
    expect(source).toContain('.game-result-confetti-piece-inner');
    const keyframe = rule('@keyframes game-result-confetti-flutter');
    expect(keyframe).toContain('rotateX');
    expect(keyframe).toContain('scaleX');
    const noPreference = block('@media (prefers-reduced-motion: no-preference)', confettiSectionStart);
    expect(noPreference).toMatch(/game-result-confetti-piece-inner[^}]*animation:[^;]*\balternate\b/s);
  });
});

describe('confetti piece is invisible during its own per-piece delay (bugfix: owner report — ~40 pieces sat motionless in two static edge columns before bursting)', () => {
  // `animation: … var(--confetti-delay, 300ms) … both` (the piece rule
  // above) fills BACKWARDS during that delay: the browser paints the 0%
  // keyframe's own values at the piece's spawn point for the whole delay,
  // before the animation itself ever starts. The 0% stop used to read
  // `opacity: 1` at `translate(0, 0)` — exactly the spawn point — so every
  // piece sat fully visible and motionless there until ITS OWN delay
  // elapsed, reading as two static columns at the stage's left/right edges
  // (`reorder-390-result.png`/`groupsort-390-result.png`) rather than a
  // burst.
  it('starts fully transparent at 0%, so nothing is visible at the spawn point during the delay', () => {
    const keyframe = rule('@keyframes game-result-confetti-piece');
    // `(?<!\d)` guards against `0%` false-matching the TAIL of `60%`/`100%`
    // elsewhere in this same keyframe (both literally contain the substring
    // "0%") — without it this assertion can pass by matching the 100% stop's
    // own (legitimate) `opacity: 0;` instead of the 0% stop actually under
    // test.
    expect(keyframe).toMatch(/(?<!\d)0%\s*\{[^}]*opacity:\s*0;/s);
  });

  it('reaches full opacity within the first few percent of the timeline — long before phase 1 ends at 12% — so the burst still pops rather than fading in slowly', () => {
    const keyframe = rule('@keyframes game-result-confetti-piece');
    const beforePhase1Ends = keyframe.slice(0, keyframe.indexOf('12%'));
    expect(beforePhase1Ends).toMatch(/opacity:\s*1;/);
  });

  it('keeps the phase-1 explosive-overshoot easing declared at 0%, unchanged by the opacity fix', () => {
    const keyframe = rule('@keyframes game-result-confetti-piece');
    expect(keyframe).toMatch(/0%\s*\{[^}]*animation-timing-function:\s*cubic-bezier\(0\.17,\s*0\.89,\s*0\.32,\s*1\.25\)/s);
  });
});

describe('confetti inner flutter stays finite (MAJOR bugfix: used to run forever on up to 40 invisible pieces)', () => {
  it('never declares an infinite animation anywhere in the confetti rules', () => {
    const confettiSection = section.slice(confettiSectionStart);
    expect(confettiSection).not.toMatch(/animation:[^;]*\binfinite\b/);
  });

  it('still alternates direction, for a bounded, explicit iteration count instead', () => {
    const noPreference = block('@media (prefers-reduced-motion: no-preference)', confettiSectionStart);
    expect(noPreference).toMatch(/\.game-result-confetti-piece-inner[^}]*animation:[^;]*\s\d+\s+alternate/s);
  });
});

describe('confetti reduced-motion fallback: gentle, never nothing (bugfix: "no aparecen para nada")', () => {
  it('no longer hides the whole confetti layer outright', () => {
    expect(source).not.toMatch(/\.game-result-confetti\s*\{\s*display:\s*none/);
  });

  it('still hides most individual pieces, but reveals a small evenly-spread subset', () => {
    const reduce = block('@media (prefers-reduced-motion: reduce)', confettiSectionStart);
    expect(reduce).toMatch(/\.game-result-confetti-piece\s*\{\s*display:\s*none;/);
    expect(reduce).toContain(':nth-child(5n + 1)');
  });

  it('moves the surviving subset with opacity + translateY only, never rotation or the burst/fall variables', () => {
    const reduce = block('@media (prefers-reduced-motion: reduce)', confettiSectionStart);
    const survivorsRule = reduce.slice(reduce.indexOf(':nth-child(5n + 1)'));
    expect(survivorsRule).toMatch(/translateY\(/);
    expect(survivorsRule).not.toContain('rotate(');
    expect(survivorsRule).not.toContain('--confetti-dx');
    expect(survivorsRule).not.toContain('--confetti-fall-dx');
  });
});
