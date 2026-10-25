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
    expect(body).toMatch(/transform:\s*translateY\(160%\)\s*scale\(0\.85\)/);
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
    expect(reduce).toMatch(/\.game-result-vanina\s*\{[^}]*transform:\s*translateY\(50%\)/s);
    expect(reduce).toMatch(/\.game-result-vanina\[data-ready='true'\]\s*\{[^}]*opacity:\s*1/s);
    // Never the full slide-up under reduced motion.
    expect(reduce).not.toMatch(/\.game-result-vanina[^{]*\{[^}]*translateY\(160%\)/s);
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
