import { describe, it, expect } from 'vitest';
import { parseScene, parseSceneOrThrow } from './scene';

function validLine(overrides: Record<string, unknown> = {}) {
  return {
    id: 'l1',
    speaker: { name: 'Innkeeper' },
    en: 'Hello!',
    es: '¡Hola!',
    ...overrides,
  };
}

function validScene(overrides: Record<string, unknown> = {}) {
  return {
    id: 'village-inn',
    title: 'The Village Inn',
    background: 'inn',
    lines: [validLine()],
    ...overrides,
  };
}

describe('parseScene', () => {
  it('accepts a minimal valid scene', () => {
    const result = parseScene(validScene());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.scene?.id).toBe('village-inn');
    expect(result.scene?.lines).toHaveLength(1);
  });

  it('accepts a line with grammar and no choice', () => {
    const result = parseScene(
      validScene({
        lines: [validLine({ grammar: { title: 'To be', note: 'Verbo ser/estar en presente.' } })],
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.scene?.lines[0]?.grammar).toEqual({
      title: 'To be',
      note: 'Verbo ser/estar en presente.',
    });
  });

  it('accepts a line with a well-formed choice (exactly one correct option)', () => {
    const result = parseScene(
      validScene({
        lines: [
          validLine({
            choice: {
              question_es: '¿Qué dice el posadero?',
              options: [
                { en: 'Hello!', correct: true, feedback_es: '¡Correcto!' },
                { en: 'Goodbye!', correct: false, feedback_es: 'No, intenta de nuevo.' },
              ],
            },
          }),
        ],
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.scene?.lines[0]?.choice?.options).toHaveLength(2);
  });

  it('rejects a non-object payload', () => {
    const result = parseScene('not an object');
    expect(result.ok).toBe(false);
    expect(result.scene).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects a missing/blank title', () => {
    const result = parseScene(validScene({ title: '  ' }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.startsWith('title:'))).toBe(true);
  });

  it('rejects an invalid background', () => {
    const result = parseScene(validScene({ background: 'space-station' }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.startsWith('background:'))).toBe(true);
  });

  it('rejects an empty lines array', () => {
    const result = parseScene(validScene({ lines: [] }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.startsWith('lines:'))).toBe(true);
  });

  it('rejects a line missing en/es', () => {
    const result = parseScene(validScene({ lines: [validLine({ en: '', es: '' })] }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('.en:'))).toBe(true);
    expect(result.errors.some((e) => e.includes('.es:'))).toBe(true);
  });

  it('rejects a line with no speaker name', () => {
    const result = parseScene(validScene({ lines: [validLine({ speaker: { name: '' } })] }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('speaker.name'))).toBe(true);
  });

  it('rejects a choice with fewer than 2 options', () => {
    const result = parseScene(
      validScene({
        lines: [
          validLine({
            choice: {
              question_es: '¿Qué dice?',
              options: [{ en: 'Hello!', correct: true, feedback_es: 'OK' }],
            },
          }),
        ],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('choice.options'))).toBe(true);
  });

  it('rejects a choice with zero correct options', () => {
    const result = parseScene(
      validScene({
        lines: [
          validLine({
            choice: {
              question_es: '¿Qué dice?',
              options: [
                { en: 'Hello!', correct: false, feedback_es: 'No' },
                { en: 'Goodbye!', correct: false, feedback_es: 'No' },
              ],
            },
          }),
        ],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('exactly one option must be correct'))).toBe(true);
  });

  it('rejects a choice with more than one correct option', () => {
    const result = parseScene(
      validScene({
        lines: [
          validLine({
            choice: {
              question_es: '¿Qué dice?',
              options: [
                { en: 'Hello!', correct: true, feedback_es: 'OK' },
                { en: 'Goodbye!', correct: true, feedback_es: 'OK' },
              ],
            },
          }),
        ],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('exactly one option must be correct'))).toBe(true);
  });

  it('rejects duplicate line ids', () => {
    const result = parseScene(validScene({ lines: [validLine({ id: 'l1' }), validLine({ id: 'l1' })] }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('duplicate line id'))).toBe(true);
  });

  it('rejects a next pointer to an unknown line id', () => {
    const result = parseScene(validScene({ lines: [validLine({ id: 'l1', next: 'ghost' })] }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('unknown line id'))).toBe(true);
  });

  it('accepts a next pointer to a real line id', () => {
    const result = parseScene(
      validScene({ lines: [validLine({ id: 'l1', next: 'l2' }), validLine({ id: 'l2' })] }),
    );
    expect(result.ok).toBe(true);
  });

  it('collects multiple errors in one pass rather than stopping at the first', () => {
    const result = parseScene(validScene({ title: '', background: 'nowhere' }));
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('parseSceneOrThrow', () => {
  it('returns the scene for valid data', () => {
    expect(parseSceneOrThrow(validScene()).id).toBe('village-inn');
  });

  it('throws with every collected error joined for invalid data', () => {
    expect(() => parseSceneOrThrow(validScene({ title: '' }))).toThrow(/title:/);
  });
});
