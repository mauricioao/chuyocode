// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import QuizLivePreview from './QuizLivePreview';
import type { Payload } from '@/lib/exercisePayload';

afterEach(() => cleanup());

const ONE_QUESTION: Payload = {
  pools: {},
  slots: [{ id: 's1', label: 'The cat ___ on the mat', input: 'text', answer: ['sits'] }],
};

describe('QuizLivePreview — renders the real practice component', () => {
  it('mounts QuizBlockPractice for this block', () => {
    render(<QuizLivePreview blockId="b1" lang="es" payload={ONE_QUESTION} />);
    expect(screen.getByTestId('quiz-practice-b1-preview')).toBeTruthy();
  });

  // Visual-polish pass: the big drag-and-drop games size their own tiles off
  // their stage's own container width AND height (`mechanics/scale.ts`'s
  // `min(cqw, cqh)`-based clamps) — this preview column is one such stage,
  // bounded by `ActivityPreviewFrame`'s own fixed 1240x748 viewport (see
  // that constant's own header), so it is now a FULL (both-axis) size
  // container, the same token the real player's own stage wrappers use —
  // never the width-only `@container`, which would starve the `cqh` half of
  // every clamp to its own floor.
  it('is a full (both-axis) size container, for the shared game-stage sizing tokens', () => {
    render(<QuizLivePreview blockId="b1" lang="es" payload={ONE_QUESTION} />);
    expect(screen.getByTestId('quiz-preview-b1').className).toContain('[container-type:size]');
  });
});

describe('QuizLivePreview — checking and retrying', () => {
  it('grades the current response on Comprobar and shows a score', () => {
    render(<QuizLivePreview blockId="b1" lang="es" payload={ONE_QUESTION} />);
    const input = screen.getByTestId('quiz-slot-s1').querySelector('input, textarea') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sits' } });
    fireEvent.click(screen.getByTestId('quiz-preview-check-b1'));
    expect(screen.getByTestId('quiz-preview-score-b1').textContent).toContain('1 / 1');
  });

  it('Reintentar clears the response and the score', () => {
    render(<QuizLivePreview blockId="b1" lang="es" payload={ONE_QUESTION} />);
    const input = screen.getByTestId('quiz-slot-s1').querySelector('input, textarea') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sits' } });
    fireEvent.click(screen.getByTestId('quiz-preview-check-b1'));
    fireEvent.click(screen.getByTestId('quiz-preview-retry-b1'));
    expect(screen.queryByTestId('quiz-preview-score-b1')).toBeNull();
    expect((screen.getByTestId('quiz-slot-s1').querySelector('input, textarea') as HTMLInputElement).value).toBe('');
  });
});

describe('QuizLivePreview — opens in the template\'s own game (owner review of the match stage)', () => {
  const MATCH_PAYLOAD: Payload = {
    pools: {},
    slots: [
      { id: 's1', label: 'dog', input: 'text', answer: ['perro'] },
      { id: 's2', label: 'cat', input: 'text', answer: ['gato'] },
      { id: 's3', label: 'bird', input: 'text', answer: ['pájaro'] },
    ],
  };

  const REORDER_PAYLOAD: Payload = {
    pools: {},
    slots: [{ id: 's1', label: 'Cats sleep', input: 'text', answer: ['Cats sleep'] }],
  };

  it('opens a "match" block\'s preview in Parejas, not Básico', () => {
    render(<QuizLivePreview blockId="b1" lang="es" payload={MATCH_PAYLOAD} template="match" />);
    expect(screen.getByTestId('quiz-matching')).toBeTruthy();
    expect(screen.queryByTestId('quiz-slot-s1')).toBeNull();
  });

  it('opens a "reorder" block\'s preview in Reordenar, not Básico', () => {
    render(<QuizLivePreview blockId="b1" lang="es" payload={REORDER_PAYLOAD} template="reorder" />);
    expect(screen.getByTestId('quiz-reorder')).toBeTruthy();
    expect(screen.queryByTestId('quiz-slot-s1')).toBeNull();
  });

  it('still opens Básico with no template', () => {
    render(<QuizLivePreview blockId="b1" lang="es" payload={MATCH_PAYLOAD} />);
    expect(screen.getByTestId('quiz-slot-s1')).toBeTruthy();
  });

  it('opens a "groupsort" block\'s preview in Ordenar por grupos, not Básico', () => {
    const GROUPSORT_PAYLOAD: Payload = {
      pools: { p1: [{ id: 'dog', text: 'dog' }, { id: 'cat', text: 'cat' }, { id: 'bread', text: 'bread' }, { id: 'rice', text: 'rice' }] },
      slots: [
        { id: 'g1', label: 'Animals', input: 'group', pool: 'p1', answer: ['dog', 'cat'] },
        { id: 'g2', label: 'Food', input: 'group', pool: 'p1', answer: ['bread', 'rice'] },
      ],
    };
    render(<QuizLivePreview blockId="b1" lang="es" payload={GROUPSORT_PAYLOAD} template="groupsort" />);
    expect(screen.getByTestId('quiz-groupsort')).toBeTruthy();
    expect(screen.queryByTestId('quiz-slot-g1')).toBeNull();
  });
});

describe('QuizLivePreview — ONE TEMPLATE, ONE GAME (owner spec, build item 1)', () => {
  const MATCH_PAYLOAD: Payload = {
    pools: {},
    slots: [
      { id: 's1', label: 'dog', input: 'text', answer: ['perro'] },
      { id: 's2', label: 'cat', input: 'text', answer: ['gato'] },
      { id: 's3', label: 'bird', input: 'text', answer: ['pájaro'] },
    ],
  };

  it('never shows the mode switcher for a templated block', () => {
    render(<QuizLivePreview blockId="b1" lang="es" payload={MATCH_PAYLOAD} template="match" />);
    expect(screen.queryByTestId('quiz-game-mode-switcher')).toBeNull();
  });

  // Owner audit (`PROPUESTA-PLANTILLAS-2026-10-23.md` §c): the editor-only
  // "Estas preguntas se usan en N juegos" badge is gone entirely now that
  // the preview is the real activity frame — never shown, templated or not.
  it('never shows the "used in N games" badge, templated or Básico', () => {
    render(<QuizLivePreview blockId="b1" lang="es" payload={MATCH_PAYLOAD} template="match" />);
    expect(screen.queryByTestId('quiz-preview-games-badge-b1')).toBeNull();

    render(<QuizLivePreview blockId="b1" lang="es" payload={MATCH_PAYLOAD} />);
    expect(screen.queryByTestId('quiz-preview-games-badge-b1')).toBeNull();
  });
});

describe('QuizLivePreview — one activity frame (owner audit §c)', () => {
  it('renders inside the real activity frame, with the floating Comprobar contained by its own activity-stage', () => {
    const ONE_QUESTION_LOCAL: Payload = {
      pools: {},
      slots: [{ id: 's1', label: 'The cat ___ on the mat', input: 'text', answer: ['sits'] }],
    };
    render(<QuizLivePreview blockId="b1" lang="es" payload={ONE_QUESTION_LOCAL} />);
    const stage = screen.getByTestId('activity-stage');
    expect(stage.contains(screen.getByTestId('quiz-preview-actions-b1'))).toBe(true);
    expect(screen.getByTestId('window-title-bar')).toBeTruthy();
  });

  it('shows the real activity title and level, as the student\'s own window shows them', () => {
    render(
      <QuizLivePreview
        blockId="b1"
        lang="es"
        payload={ONE_QUESTION}
        activityTitle="Animales de la granja"
        activityLevelChip="Básico A2"
      />,
    );
    expect(screen.getByTestId('window-title-bar-title').textContent).toBe('Animales de la granja');
    expect(screen.getByTestId('window-title-bar-level').textContent).toBe('Básico A2');
  });

  it('falls back to the placeholder title while the activity has no title yet', () => {
    render(<QuizLivePreview blockId="b1" lang="es" payload={ONE_QUESTION} activityTitle="" />);
    expect(screen.getByTestId('window-title-bar-title').textContent).toBe('Vista previa');
  });

  it('paints the block\'s own background behind the preview', () => {
    render(
      <QuizLivePreview
        blockId="b1"
        lang="es"
        payload={ONE_QUESTION}
        background={{ kind: 'preset', preset: 'sun' }}
      />,
    );
    expect(screen.getByTestId('activity-stage-backdrop-preset').style.background).toContain('var(--backdrop-sun)');
  });
});

describe('QuizLivePreview — resets on structural change', () => {
  it('clears the response and score once the question set changes shape', () => {
    const { rerender } = render(<QuizLivePreview blockId="b1" lang="es" payload={ONE_QUESTION} />);
    const input = screen.getByTestId('quiz-slot-s1').querySelector('input, textarea') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sits' } });
    fireEvent.click(screen.getByTestId('quiz-preview-check-b1'));
    expect(screen.getByTestId('quiz-preview-score-b1')).toBeTruthy();

    const twoQuestions: Payload = {
      pools: {},
      slots: [
        { id: 's1', label: 'The cat ___ on the mat', input: 'text', answer: ['sits'] },
        { id: 's2', label: 'New one', input: 'text', answer: ['x'] },
      ],
    };
    rerender(<QuizLivePreview blockId="b1" lang="es" payload={twoQuestions} />);
    expect(screen.queryByTestId('quiz-preview-score-b1')).toBeNull();
  });

  it('does NOT reset just because an existing question text changed', () => {
    const { rerender } = render(<QuizLivePreview blockId="b1" lang="es" payload={ONE_QUESTION} />);
    const input = screen.getByTestId('quiz-slot-s1').querySelector('input, textarea') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sits' } });

    const editedLabel: Payload = {
      pools: {},
      slots: [{ id: 's1', label: 'The cat ___ on the rug', input: 'text', answer: ['sits'] }],
    };
    rerender(<QuizLivePreview blockId="b1" lang="es" payload={editedLabel} />);
    expect((screen.getByTestId('quiz-slot-s1').querySelector('input, textarea') as HTMLInputElement).value).toBe(
      'sits',
    );
  });
});

describe('QuizLivePreview — fills the activity stage (owner bug: result screen squeezed into a short top band)', () => {
  const MATCH_PAYLOAD: Payload = {
    pools: {},
    slots: [
      { id: 's1', label: 'dog', input: 'text', answer: ['perro'] },
      { id: 's2', label: 'cat', input: 'text', answer: ['gato'] },
      { id: 's3', label: 'bird', input: 'text', answer: ['pájaro'] },
    ],
  };

  it("stretches to fill ActivityStage, so a self-checking mold's GameResult can fill it too", () => {
    // `ActivityStage` (tonight's `contain: layout` pass) only reserves space
    // for a flex child that itself opts into `flex-1`/`min-h-0` — this
    // column used to be a plain `flex flex-col`, so it sized to its own
    // CONTENT instead of the stage, and `GameResult` (further down, inside
    // the mold) collapsed to a short band instead of filling the activity
    // body.
    render(<QuizLivePreview blockId="b1" lang="es" payload={MATCH_PAYLOAD} template="match" />);
    const className = screen.getByTestId('quiz-preview-b1').className;
    expect(className).toMatch(/\bflex-1\b/);
    expect(className).toMatch(/\bmin-h-0\b/);
  });

  it("reserves the same baseline 12px gap on every side GameResult's own crop-line bleed assumes", () => {
    // `GameResult.tsx`'s `-mb-3` bleed is sized for a 12px ambient bottom
    // padding (the real player's own stage wrapper uses `p-3`, all sides) —
    // this column used to reserve only the bottom (`pb-3`), with nothing on
    // the other three; `p-3` matches the real player's own wrapper exactly,
    // with `pb-20` (below) still free to override just the bottom when the
    // floating Comprobar needs the extra room.
    render(<QuizLivePreview blockId="b1" lang="es" payload={MATCH_PAYLOAD} template="match" />);
    expect(screen.getByTestId('quiz-preview-b1').className).toMatch(/\bp-3\b/);
  });

  it('does not reserve the floating-Comprobar gap for a self-checking mold, which renders its own', () => {
    render(<QuizLivePreview blockId="b1" lang="es" payload={MATCH_PAYLOAD} template="match" />);
    expect(screen.getByTestId('quiz-preview-b1').className).not.toMatch(/\bpb-20\b/);
  });

  it('keeps the floating-Comprobar gap for Básico, where this preview shows its own', () => {
    render(<QuizLivePreview blockId="b1" lang="es" payload={ONE_QUESTION} />);
    expect(screen.getByTestId('quiz-preview-b1').className).toMatch(/\bpb-20\b/);
  });
});

// STALE-MODE FIX (polish batch T1, "molded activity previews show the real
// board, never the generic Básico layout"): `mode` used to be cached in
// `useState`, re-derived only when `structuralKey` (the slot id LIST)
// changed — typing into an EXISTING sentence/pair never changes that list,
// so the cached mode stayed stuck at whatever `initialGameMode` picked on
// the very FIRST render, even once the content became eligible. `mode` is
// now a plain derivation (`chosenMode ?? initialGameMode(...)`, recomputed
// every render) — these payloads deliberately keep the SAME slot id
// (`structuralKey` unchanged) across the rerender, the exact shape of the
// owner's own "typing into an existing reorder sentence" bug report.
describe('QuizLivePreview — does not cache a stale mode against a board that gains or has no content (T1)', () => {
  it('reorder: nothing renders for a still-1-word sentence, then quiz-reorder once it reaches 2+ words — never Básico, under the SAME slot id', () => {
    const oneWord: Payload = {
      pools: {},
      slots: [{ id: 's1', label: 'I', input: 'text', answer: ['I'] }],
    };
    const { rerender, container } = render(
      <QuizLivePreview blockId="b1" lang="es" payload={oneWord} template="reorder" />,
    );
    expect(container.firstChild).toBeNull();

    const twoWords: Payload = {
      pools: {},
      slots: [{ id: 's1', label: 'I like apples', input: 'text', answer: ['I like apples'] }],
    };
    rerender(<QuizLivePreview blockId="b1" lang="es" payload={twoWords} template="reorder" />);
    expect(screen.getByTestId('quiz-reorder')).toBeTruthy();
    expect(screen.queryByTestId('quiz-slot-s1')).toBeNull();
    // ONE "COMPROBAR": reorder is self-checking and already shows its own —
    // this preview's own floating bar must key off the DERIVED mode, so a
    // board never shows next to a second Comprobar.
    expect(screen.queryByTestId('quiz-preview-actions-b1')).toBeNull();
  });

  it('match: shows quiz-matching with just 2 pairs — a playable board, not gated by the 3-pair "worth offering" floor', () => {
    const twoPairs: Payload = {
      pools: {},
      slots: [
        { id: 's1', label: 'dog', input: 'text', answer: ['perro'] },
        { id: 's2', label: 'cat', input: 'text', answer: ['gato'] },
      ],
    };
    render(<QuizLivePreview blockId="b1" lang="es" payload={twoPairs} template="match" />);
    expect(screen.getByTestId('quiz-matching')).toBeTruthy();
  });

  it('groupsort: shows quiz-groupsort with 2 groups of just 1 item each — not gated by the 2-items-per-group floor', () => {
    const oneItemPerGroup: Payload = {
      pools: { p1: [{ id: 'dog', text: 'dog' }, { id: 'bread', text: 'bread' }] },
      slots: [
        { id: 'g1', label: 'Animals', input: 'group', pool: 'p1', answer: ['dog'] },
        { id: 'g2', label: 'Food', input: 'group', pool: 'p1', answer: ['bread'] },
      ],
    };
    render(<QuizLivePreview blockId="b1" lang="es" payload={oneItemPerGroup} template="groupsort" />);
    expect(screen.getByTestId('quiz-groupsort')).toBeTruthy();
  });

  it('cloze: renders nothing for a sentence whose bracket is still unclosed — nothing playable yet, not a crash and not Básico', () => {
    const unclosed: Payload = {
      pools: {},
      slots: [{ id: 's1', label: 'She [is', input: 'text', answer: [] }],
      blocks: [{ kind: 'row', id: 'row-cz-s0-b0-1', slotId: 's1' }],
    };
    const { container } = render(<QuizLivePreview blockId="b1" lang="es" payload={unclosed} template="cloze" />);
    expect(container.firstChild).toBeNull();
  });
});

// Guard: the Básico multi-mode switcher (template === undefined) is
// untouched by the `chosenMode` refactor above — only IT ever calls
// `onModeChange`, so a chosen alternate game must still survive a plain
// label edit (no structural change) and still reset once the question SET
// changes shape, exactly as it did before this pass.
describe('QuizLivePreview — Básico switcher choice survives a label edit, resets on a structural change (guard)', () => {
  const THREE_SLOT_PAYLOAD: Payload = {
    pools: {},
    slots: [
      { id: 's1', label: 'dog', input: 'text', answer: ['perro'] },
      { id: 's2', label: 'cat', input: 'text', answer: ['gato'] },
      { id: 's3', label: 'bird', input: 'text', answer: ['pájaro'] },
    ],
  };

  it('keeps Tarjetas chosen across a label-only edit, and drops it back to Básico on a structural change', () => {
    const { rerender } = render(<QuizLivePreview blockId="b1" lang="es" payload={THREE_SLOT_PAYLOAD} />);
    fireEvent.click(screen.getByTestId('quiz-game-mode-cards'));
    expect(screen.getByTestId('quiz-flashcards')).toBeTruthy();

    const editedLabel: Payload = {
      ...THREE_SLOT_PAYLOAD,
      slots: THREE_SLOT_PAYLOAD.slots.map((s) => (s.id === 's1' ? { ...s, label: 'puppy' } : s)),
    };
    rerender(<QuizLivePreview blockId="b1" lang="es" payload={editedLabel} />);
    expect(screen.getByTestId('quiz-flashcards')).toBeTruthy();

    const fourSlots: Payload = {
      ...THREE_SLOT_PAYLOAD,
      slots: [...THREE_SLOT_PAYLOAD.slots, { id: 's4', label: 'fish', input: 'text', answer: ['pez'] }],
    };
    rerender(<QuizLivePreview blockId="b1" lang="es" payload={fourSlots} />);
    expect(screen.queryByTestId('quiz-flashcards')).toBeNull();
    expect(screen.getByTestId('quiz-slot-s1')).toBeTruthy();
  });
});
