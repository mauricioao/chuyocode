import { describe, it, expect } from 'vitest';
import { parseSceneOrThrow } from './scene';
import { aventuraReducer, initialAventuraState, progressLabel } from './engine';

const speaker = { name: 'Innkeeper' };

const scene = parseSceneOrThrow({
  id: 'test-scene',
  title: 'Test scene',
  background: 'inn',
  lines: [
    { id: 'l1', speaker, en: 'Hello!', es: '¡Hola!' },
    {
      id: 'l2',
      speaker,
      en: 'How much is a room?',
      es: '¿Cuánto cuesta una habitación?',
      grammar: { title: 'How much is/are', note: 'Se usa para preguntar precios.' },
      choice: {
        question_es: '¿Qué está preguntando?',
        options: [
          { en: 'the price', correct: true, feedback_es: '¡Correcto!' },
          { en: 'the time', correct: false, feedback_es: 'No, intenta de nuevo.' },
        ],
      },
    },
    { id: 'l3', speaker, en: 'Thank you!', es: '¡Gracias!', grammar: { title: 'Greetings', note: 'Saludos comunes.' } },
  ],
});

describe('initialAventuraState', () => {
  it('starts at line 0 with it already recorded as visited', () => {
    const state = initialAventuraState(scene);
    expect(state.index).toBe(0);
    expect(state.phase).toBe('playing');
    expect(state.visitedLineIds).toEqual(['l1']);
    expect(state.choiceState).toBeNull();
    expect(state.history).toEqual([]);
  });

  it('sets choiceState to unanswered when the first line has a choice', () => {
    const oneLineChoiceScene = parseSceneOrThrow({
      id: 's',
      title: 't',
      background: 'inn',
      lines: [scene.lines[1]],
    });
    expect(initialAventuraState(oneLineChoiceScene).choiceState).toBe('unanswered');
  });
});

describe('aventuraReducer — ADVANCE', () => {
  it('moves to the next line in authored order and records the visit', () => {
    const state = initialAventuraState(scene);
    const next = aventuraReducer(scene, state, { type: 'ADVANCE' });
    expect(next.index).toBe(1);
    expect(next.visitedLineIds).toEqual(['l1', 'l2']);
    expect(next.choiceState).toBe('unanswered');
    expect(next.history).toEqual([0]);
  });

  it('is a no-op when the current line has an unanswered choice', () => {
    const state = aventuraReducer(scene, initialAventuraState(scene), { type: 'ADVANCE' }); // now on l2
    const blocked = aventuraReducer(scene, state, { type: 'ADVANCE' });
    expect(blocked).toBe(state);
  });

  it('advances once the choice on the current line is answered correctly', () => {
    let state = initialAventuraState(scene);
    state = aventuraReducer(scene, state, { type: 'ADVANCE' }); // l2
    state = aventuraReducer(scene, state, { type: 'SELECT_CHOICE', optionIndex: 0 }); // correct
    state = aventuraReducer(scene, state, { type: 'ADVANCE' });
    expect(state.index).toBe(2);
  });

  it('records the grammar note of every newly reached line, deduplicated by title', () => {
    let state = initialAventuraState(scene);
    state = aventuraReducer(scene, state, { type: 'ADVANCE' });
    state = aventuraReducer(scene, state, { type: 'SELECT_CHOICE', optionIndex: 0 });
    state = aventuraReducer(scene, state, { type: 'ADVANCE' });
    expect(state.learnedGrammar.map((g) => g.title)).toEqual(['How much is/are', 'Greetings']);
  });

  it('reaches phase "end" after the last line, and further ADVANCE is a no-op', () => {
    let state = initialAventuraState(scene);
    state = aventuraReducer(scene, state, { type: 'ADVANCE' });
    state = aventuraReducer(scene, state, { type: 'SELECT_CHOICE', optionIndex: 0 });
    state = aventuraReducer(scene, state, { type: 'ADVANCE' }); // l3
    state = aventuraReducer(scene, state, { type: 'ADVANCE' }); // end
    expect(state.phase).toBe('end');
    const again = aventuraReducer(scene, state, { type: 'ADVANCE' });
    expect(again).toBe(state);
  });

  it('follows an authored `next` pointer instead of authored order', () => {
    const branchy = parseSceneOrThrow({
      id: 'b',
      title: 't',
      background: 'inn',
      lines: [
        { id: 'a', speaker, en: 'A', es: 'A', next: 'c' },
        { id: 'b', speaker, en: 'B', es: 'B' },
        { id: 'c', speaker, en: 'C', es: 'C' },
      ],
    });
    const state = aventuraReducer(branchy, initialAventuraState(branchy), { type: 'ADVANCE' });
    expect(state.index).toBe(2);
  });
});

describe('aventuraReducer — SELECT_CHOICE / RETRY', () => {
  it('a wrong answer sets choiceState to "wrong" without advancing', () => {
    let state = initialAventuraState(scene);
    state = aventuraReducer(scene, state, { type: 'ADVANCE' }); // l2
    const wrong = aventuraReducer(scene, state, { type: 'SELECT_CHOICE', optionIndex: 1 });
    expect(wrong.choiceState).toBe('wrong');
    expect(wrong.index).toBe(1);
    expect(wrong.selectedOptionIndex).toBe(1);
  });

  it('RETRY resets a wrong choice back to unanswered', () => {
    let state = initialAventuraState(scene);
    state = aventuraReducer(scene, state, { type: 'ADVANCE' });
    state = aventuraReducer(scene, state, { type: 'SELECT_CHOICE', optionIndex: 1 });
    const retried = aventuraReducer(scene, state, { type: 'RETRY' });
    expect(retried.choiceState).toBe('unanswered');
    expect(retried.selectedOptionIndex).toBeNull();
  });

  it('can retry after a wrong answer and then pick correctly', () => {
    let state = initialAventuraState(scene);
    state = aventuraReducer(scene, state, { type: 'ADVANCE' });
    state = aventuraReducer(scene, state, { type: 'SELECT_CHOICE', optionIndex: 1 }); // wrong
    state = aventuraReducer(scene, state, { type: 'RETRY' });
    state = aventuraReducer(scene, state, { type: 'SELECT_CHOICE', optionIndex: 0 }); // correct
    expect(state.choiceState).toBe('correct');
  });

  it('RETRY is a no-op unless the choice is currently wrong', () => {
    const state = initialAventuraState(scene);
    expect(aventuraReducer(scene, state, { type: 'RETRY' })).toBe(state);
  });

  it('SELECT_CHOICE is a no-op once the choice is already correct', () => {
    let state = initialAventuraState(scene);
    state = aventuraReducer(scene, state, { type: 'ADVANCE' });
    state = aventuraReducer(scene, state, { type: 'SELECT_CHOICE', optionIndex: 0 });
    const again = aventuraReducer(scene, state, { type: 'SELECT_CHOICE', optionIndex: 1 });
    expect(again).toBe(state);
  });

  it('SELECT_CHOICE is a no-op on a line with no choice', () => {
    const state = initialAventuraState(scene);
    expect(aventuraReducer(scene, state, { type: 'SELECT_CHOICE', optionIndex: 0 })).toBe(state);
  });
});

describe('aventuraReducer — BACK', () => {
  it('is a no-op on the first line (empty history)', () => {
    const state = initialAventuraState(scene);
    expect(aventuraReducer(scene, state, { type: 'BACK' })).toBe(state);
  });

  it('returns to the previous line and re-asks an unanswered choice', () => {
    let state = initialAventuraState(scene);
    state = aventuraReducer(scene, state, { type: 'ADVANCE' }); // l2
    state = aventuraReducer(scene, state, { type: 'SELECT_CHOICE', optionIndex: 0 }); // correct
    state = aventuraReducer(scene, state, { type: 'ADVANCE' }); // l3
    const back = aventuraReducer(scene, state, { type: 'BACK' });
    expect(back.index).toBe(1);
    expect(back.choiceState).toBe('unanswered');
  });

  it('resets phase back to "playing" from "end"', () => {
    let state = initialAventuraState(scene);
    state = aventuraReducer(scene, state, { type: 'ADVANCE' });
    state = aventuraReducer(scene, state, { type: 'SELECT_CHOICE', optionIndex: 0 });
    state = aventuraReducer(scene, state, { type: 'ADVANCE' });
    state = aventuraReducer(scene, state, { type: 'ADVANCE' }); // end
    const back = aventuraReducer(scene, state, { type: 'BACK' });
    expect(back.phase).toBe('playing');
    expect(back.index).toBe(2);
  });
});

describe('aventuraReducer — RESTART', () => {
  it('resets everything to the initial state', () => {
    let state = initialAventuraState(scene);
    state = aventuraReducer(scene, state, { type: 'ADVANCE' });
    state = aventuraReducer(scene, state, { type: 'SELECT_CHOICE', optionIndex: 0 });
    const restarted = aventuraReducer(scene, state, { type: 'RESTART' });
    expect(restarted).toEqual(initialAventuraState(scene));
  });
});

describe('progressLabel', () => {
  it('reports 1-based current line out of the total', () => {
    expect(progressLabel(scene, initialAventuraState(scene))).toEqual({ current: 1, total: 3 });
  });

  it('caps at the total once the scene has ended', () => {
    let state = initialAventuraState(scene);
    state = aventuraReducer(scene, state, { type: 'ADVANCE' });
    state = aventuraReducer(scene, state, { type: 'SELECT_CHOICE', optionIndex: 0 });
    state = aventuraReducer(scene, state, { type: 'ADVANCE' });
    state = aventuraReducer(scene, state, { type: 'ADVANCE' }); // end, index stays at 2
    expect(progressLabel(scene, state)).toEqual({ current: 3, total: 3 });
  });
});
