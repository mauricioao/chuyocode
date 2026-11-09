import { describe, it, expect } from 'vitest';
import { parseChoosePaste } from './pasteChoose';

describe('parseChoosePaste', () => {
  it('splits "oración | correcta | otra | otra" into the sentence and its options, the correct one first', () => {
    expect(parseChoosePaste('She ___ to school every day. | goes | go | going')).toEqual([
      { sentence: 'She ___ to school every day.', options: ['goes', 'go', 'going'] },
    ]);
  });

  it('trims every field', () => {
    expect(parseChoosePaste("  I ___ attention while the teacher ___.  |  wasn't paying / was speaking |payed / spoke  ")).toEqual([
      { sentence: 'I ___ attention while the teacher ___.', options: ["wasn't paying / was speaking", 'payed / spoke'] },
    ]);
  });

  it('reads one question per line, in order, skipping empty lines', () => {
    expect(parseChoosePaste('A ___ | x | y\n\n   \nB ___ | z | w\r\nC ___ | u | v')).toEqual([
      { sentence: 'A ___', options: ['x', 'y'] },
      { sentence: 'B ___', options: ['z', 'w'] },
      { sentence: 'C ___', options: ['u', 'v'] },
    ]);
  });

  it('keeps at most 4 options', () => {
    expect(parseChoosePaste('S ___ | a | b | c | d | e | f')).toEqual([{ sentence: 'S ___', options: ['a', 'b', 'c', 'd'] }]);
  });

  it('a line without "|" is a sentence with no options yet', () => {
    expect(parseChoosePaste('She ___ to school every day.')).toEqual([
      { sentence: 'She ___ to school every day.', options: [] },
    ]);
  });

  it('keeps an empty correct option in its place instead of promoting the next one to correct', () => {
    expect(parseChoosePaste('S ___ |  | go | going')).toEqual([{ sentence: 'S ___', options: ['', 'go', 'going'] }]);
  });

  it('drops empty fields at the end of a line (a trailing "|")', () => {
    expect(parseChoosePaste('S ___ | goes | go | ')).toEqual([{ sentence: 'S ___', options: ['goes', 'go'] }]);
  });
});
