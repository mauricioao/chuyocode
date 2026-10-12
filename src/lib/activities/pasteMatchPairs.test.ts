import { describe, it, expect } from 'vitest';
import { parseMatchPairsPaste } from './pasteMatchPairs';

describe('parseMatchPairsPaste', () => {
  it('splits on a tab', () => {
    expect(parseMatchPairsPaste('dog\tperro')).toEqual([{ question: 'dog', answer: 'perro' }]);
  });

  it('splits on =', () => {
    expect(parseMatchPairsPaste('dog=perro')).toEqual([{ question: 'dog', answer: 'perro' }]);
  });

  it('splits on a spaced hyphen', () => {
    expect(parseMatchPairsPaste('dog - perro')).toEqual([{ question: 'dog', answer: 'perro' }]);
  });

  it('splits on a spaced en dash', () => {
    expect(parseMatchPairsPaste('dog – perro')).toEqual([{ question: 'dog', answer: 'perro' }]);
  });

  it('splits on ": "', () => {
    expect(parseMatchPairsPaste('dog: perro')).toEqual([{ question: 'dog', answer: 'perro' }]);
  });

  it('trims both sides', () => {
    expect(parseMatchPairsPaste('  dog  \t  perro  ')).toEqual([{ question: 'dog', answer: 'perro' }]);
  });

  it('prefers a tab over every other separator on the same line', () => {
    expect(parseMatchPairsPaste('dog=cat\tperro')).toEqual([{ question: 'dog=cat', answer: 'perro' }]);
  });

  it('prefers = over a dash/colon on the same line', () => {
    expect(parseMatchPairsPaste('dog - cat=perro')).toEqual([{ question: 'dog - cat', answer: 'perro' }]);
  });

  it('is question-only, empty answer, for a line with no separator', () => {
    expect(parseMatchPairsPaste('just a word')).toEqual([{ question: 'just a word', answer: '' }]);
  });

  it('parses every pasted line, in order, dropping blank lines', () => {
    expect(parseMatchPairsPaste('dog\tperro\n\ncat\tgato\nbird=pájaro')).toEqual([
      { question: 'dog', answer: 'perro' },
      { question: 'cat', answer: 'gato' },
      { question: 'bird', answer: 'pájaro' },
    ]);
  });

  it('a bare hyphen with no surrounding spaces is not treated as a separator', () => {
    expect(parseMatchPairsPaste('well-known')).toEqual([{ question: 'well-known', answer: '' }]);
  });
});
